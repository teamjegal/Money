// Gmail 연결 (읽기 전용) + 헤더만 가져와 분석
// 원칙 7: gmail.readonly, 본문 안 가져옴(format=metadata) / 원칙 8: 토큰·결과는 메모리에만
const crypto = require('crypto');
const express = require('express');
const { google } = require('googleapis');
const { parseRawMessages, groupByDomain } = require('./mbox');
const { classifyGroups } = require('./llm');

const PORT = process.env.PORT || 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const HEADERS = ['From', 'Subject', 'Date', 'List-Unsubscribe', 'List-Unsubscribe-Post'];
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const CFG = {
  months: num(process.env.GMAIL_MONTHS, 12),
  max: num(process.env.GMAIL_MAX_MESSAGES, 1500),
  concurrency: num(process.env.GMAIL_CONCURRENCY, 10),
  tries: 5,
  retryBaseMs: 1000,
};

// ---- 메모리 상태 (서버를 끄면 사라진다. 파일·DB 저장 금지) ----
const mem = { tokens: null, email: null, oauthState: null, job: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function oauthClient() {
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return null;
  return new google.auth.OAuth2(id, secret, REDIRECT_URI);
}
function gmailApi() {
  const client = oauthClient();
  client.setCredentials(mem.tokens);
  return google.gmail({ version: 'v1', auth: client });
}
const statusOf = (e) => e?.code || e?.response?.status || e?.status;

// 일시적 오류는 잠깐 쉬었다 다시: 429, 5xx, 그리고 Gmail이 403으로 주는 사용자별 속도·동시 요청 제한
const isTransient = (e) => {
  const s = +statusOf(e);
  return s === 429 || s >= 500 || /rate|quota|concurrent|backend|ECONNRESET|ETIMEDOUT|socket/i.test(e.message);
};
async function withRetry(fn, tries = 5, baseMs = 1000) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1 || !isTransient(e)) throw e;
      await sleep(baseMs * 2 ** i + Math.random() * 300); // 1s, 2s, 4s, 8s (+ 흔들기)
    }
  }
}

function afterQuery(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} -in:sent -in:drafts -in:chats`;
}

// Gmail 메타데이터 → mbox.js가 읽을 수 있는 헤더 원문 (본문 없음)
function toRawHeaders(msg) {
  const hs = (msg.payload && msg.payload.headers) || [];
  const lines = hs.filter((h) => HEADERS.includes(h.name)).map((h) => `${h.name}: ${String(h.value).replace(/[\r\n]+/g, ' ')}`);
  if (!hs.some((h) => h.name === 'Date') && msg.internalDate) lines.push(`Date: ${new Date(+msg.internalDate).toUTCString()}`);
  return lines.join('\r\n') + '\r\n\r\n';
}

// ---- 분석 작업 (진행률은 job 객체로 폴링) ----
async function runJob(job, gmail, opts = {}) {
  const cfg = { ...CFG, ...opts };
  try {
    // 1) 메일 id 목록
    job.phase = 'listing';
    const ids = [];
    let pageToken;
    do {
      const { data } = await withRetry(() => gmail.users.messages.list({
        userId: 'me', q: afterQuery(cfg.months), maxResults: Math.min(500, cfg.max - ids.length), pageToken,
      }));
      (data.messages || []).forEach((m) => ids.push(m.id));
      pageToken = data.nextPageToken;
      job.total = ids.length;
    } while (pageToken && ids.length < cfg.max && !job.cancelled);

    // 2) 헤더만 병렬로 (동시 cfg.concurrency개)
    job.phase = 'fetching';
    const raws = new Array(ids.length);
    const reasons = {}; // 실패 이유별 개수 (로그용, 메일 내용 없음)
    const fetchOne = async (i) => {
      try {
        const { data } = await withRetry(() => gmail.users.messages.get({
          userId: 'me', id: ids[i], format: 'metadata', metadataHeaders: HEADERS,
        }), cfg.tries, cfg.retryBaseMs);
        raws[i] = toRawHeaders(data);
        return true;
      } catch (e) {
        if (+statusOf(e) === 401) throw e; // 토큰 만료는 전체 중단
        const key = `${statusOf(e) || '-'} ${String(e.message).slice(0, 80)}`;
        reasons[key] = (reasons[key] || 0) + 1;
        return false;
      }
    };
    const pool = async (list, n, onEach) => {
      let next = 0;
      const worker = async () => {
        while (next < list.length && !job.cancelled) { const i = list[next++]; await onEach(i, await fetchOne(i)); }
      };
      await Promise.all(Array.from({ length: Math.min(n, list.length || 1) }, worker));
    };
    const failedIdx = [];
    await pool(ids.map((_, i) => i), cfg.concurrency, (i, ok) => { if (!ok) failedIdx.push(i); job.done++; });
    job.failed = failedIdx.length;
    // 2-1) 실패한 것만 천천히 한 번 더 (동시 2개)
    if (failedIdx.length && !job.cancelled) {
      job.phase = 'retrying';
      await sleep(cfg.retryBaseMs);
      await pool(failedIdx, 2, (i, ok) => { if (ok) job.failed--; });
    }
    if (Object.keys(reasons).length) console.warn(`[gmail] 헤더 읽기 실패 ${job.failed}/${ids.length}통, 이유:`, reasons);
    if (job.cancelled) return;

    // 3) 기존 mbox.js 그룹핑·신호 추출 → 4) 기존 분류(LLM 또는 규칙)
    job.phase = 'grouping';
    const mails = await parseRawMessages(raws.filter(Boolean));
    // 내 메일이 회사·학교 주소면 그 도메인 메일은 "기관" (주소 자체는 LLM에 보내지 않음)
    const groups = groupByDomain(mails, { selfDomain: mem.email ? mem.email.split('@')[1] : null });
    job.phase = 'classifying';
    const result = await classifyGroups(groups);
    if (job.cancelled) return;
    Object.assign(job, { phase: 'done', mode: result.mode, items: result.items, mailCount: mails.length });
  } catch (e) {
    const s = +statusOf(e);
    job.phase = 'error';
    job.error = s === 401 ? 'Gmail 연결이 만료됐어요. 다시 연결해 주세요.' : `Gmail 분석 실패: ${e.message}`;
    if (s === 401) mem.tokens = null;
    console.error('[gmail] 분석 실패:', e.message);
  }
}

const jobView = (j) => j && {
  id: j.id, phase: j.phase, done: j.done, total: j.total, failed: j.failed, error: j.error,
  mode: j.mode, mailCount: j.mailCount, items: j.phase === 'done' ? j.items : undefined,
};

// ---- 라우터 ----
const router = express.Router();

router.get('/auth/google', (req, res) => {
  const client = oauthClient();
  if (!client) return res.redirect('/?gmail=not_configured');
  mem.oauthState = crypto.randomBytes(16).toString('hex'); // CSRF 방지
  res.redirect(client.generateAuthUrl({
    access_type: 'online', // refresh token 받지 않음 (1시간 뒤 만료)
    scope: SCOPES,
    state: mem.oauthState,
    prompt: 'select_account',
  }));
});

router.get('/oauth2callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/?gmail=denied');
  if (!code || !state || state !== mem.oauthState) return res.redirect('/?gmail=bad_state');
  mem.oauthState = null;
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    mem.tokens = tokens;
    mem.job = null;
    // 화면에 "연결됨: 주소" 표시용 (LLM에는 보내지 않음)
    const { data } = await gmailApi().users.getProfile({ userId: 'me' });
    mem.email = data.emailAddress || null;
    res.redirect('/?gmail=connected');
  } catch (e) {
    console.error('[gmail] 토큰 교환 실패:', e.message);
    mem.tokens = null;
    res.redirect('/?gmail=error');
  }
});

router.get('/api/gmail/status', (req, res) => {
  res.json({ configured: !!oauthClient(), connected: !!mem.tokens, email: mem.email, config: CFG, job: jobView(mem.job) });
});

router.post('/api/analyze-gmail', (req, res) => {
  if (!mem.tokens) return res.status(401).json({ error: '먼저 Gmail을 연결해 주세요.' });
  if (mem.job && !['done', 'error'].includes(mem.job.phase)) return res.status(409).json({ error: '이미 분석 중이에요.', job: jobView(mem.job) });
  mem.job = { id: crypto.randomBytes(6).toString('hex'), phase: 'starting', done: 0, total: 0, failed: 0 };
  runJob(mem.job, gmailApi());
  res.status(202).json({ job: jobView(mem.job) });
});

router.get('/api/analyze-gmail/progress', (req, res) => {
  if (!mem.job) return res.status(404).json({ error: '진행 중인 분석이 없어요.' });
  res.json({ job: jobView(mem.job) });
});

router.post('/api/gmail/disconnect', async (req, res) => {
  const tokens = mem.tokens;
  if (mem.job) mem.job.cancelled = true;
  Object.assign(mem, { tokens: null, email: null, oauthState: null, job: null });
  // 구글 쪽 권한도 철회 (실패해도 메모리는 이미 비움)
  if (tokens && tokens.access_token) {
    try { await oauthClient().revokeToken(tokens.access_token); } catch (e) { console.warn('[gmail] 토큰 철회 실패:', e.message); }
  }
  res.json({ ok: true });
});

module.exports = { router, runJob, toRawHeaders, CFG };
