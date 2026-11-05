// Gmail 분석 파이프라인 검증 (가짜 Gmail API로, 구글 로그인 없이)
// 실행: node scripts/test-gmail.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitMessages, analyzeMailText } = require('../server/mbox');
const { runJob } = require('../server/gmail');
const { classifyGroups } = require('../server/llm');
const { buildAnalyzeUser } = require('../server/prompts');

const HEADERS = ['From', 'Subject', 'Date', 'List-Unsubscribe', 'List-Unsubscribe-Post'];
const mbox = fs.readFileSync(path.join(__dirname, '..', 'samples', 'demo.mbox'), 'utf8');

// demo.mbox 를 Gmail 메타데이터 응답처럼 바꾼다 (헤더 전부 + 본문 포함 원문 보관)
function headersOf(raw) {
  const head = raw.split(/\r?\n\r?\n/)[0].split(/\r?\n/);
  return head.map((l) => { const i = l.indexOf(':'); return { name: l.slice(0, i), value: l.slice(i + 1).trim() }; });
}
const store = splitMessages(mbox).map((raw, i) => ({ id: `m${i}`, raw, headers: headersOf(raw) }));
// 개인 메일(친구가 보낸 것)도 섞는다 → 서비스 목록에서 빠져야 함
store.push({ id: 'p1', headers: [{ name: 'From', value: '친구 <friend@gmail.com>' }, { name: 'Subject', value: '주말에 밥 먹자' }, { name: 'Date', value: 'Mon, 2 Nov 2026 10:00:00 +0900' }] });

function fakeGmail({ failOnce429 = true } = {}) {
  const calls = { list: [], get: [], maxConcurrent: 0 };
  let inflight = 0;
  const flaky = new Set(failOnce429 ? ['m3', 'm10'] : []);
  return {
    calls,
    users: { messages: {
      list: async ({ maxResults, pageToken, q }) => {
        calls.list.push({ maxResults, pageToken, q });
        const start = pageToken ? +pageToken : 0;
        const page = store.slice(start, start + Math.min(maxResults, 30)); // 30개씩 페이지
        const next = start + page.length;
        return { data: { messages: page.map((m) => ({ id: m.id })), nextPageToken: next < store.length ? String(next) : undefined } };
      },
      get: async ({ id, format, metadataHeaders }) => {
        assert.strictEqual(format, 'metadata', '본문 없이 메타데이터만 요청');
        assert.deepStrictEqual(metadataHeaders, HEADERS);
        inflight++; calls.maxConcurrent = Math.max(calls.maxConcurrent, inflight);
        calls.get.push(id);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        if (flaky.delete(id)) { const e = new Error('rateLimitExceeded'); e.code = 429; throw e; }
        const m = store.find((x) => x.id === id);
        // 실제 Gmail처럼 요청한 헤더만 돌려준다 (본문 없음)
        return { data: { id, payload: { headers: m.headers.filter((h) => HEADERS.includes(h.name)) } } };
      },
    } },
  };
}

(async () => {
  // 1) 정상 흐름
  const gmail = fakeGmail();
  const job = { phase: 'starting', done: 0, total: 0, failed: 0 };
  const seen = new Set();
  const timer = setInterval(() => seen.add(`${job.phase}${job.phase === 'fetching' ? '' : ''}`), 2);
  await runJob(job, gmail, { concurrency: 10, max: 1500 });
  clearInterval(timer);
  assert.strictEqual(job.phase, 'done', job.error);
  assert.strictEqual(job.total, store.length);
  assert.strictEqual(job.done, store.length);
  assert.strictEqual(job.failed, 0, '429는 재시도로 복구');
  assert.ok(gmail.calls.maxConcurrent <= 10, '동시 요청 10개 이하');
  assert.ok(/^after:\d{4}\/\d{1,2}\/\d{1,2} -in:sent/.test(gmail.calls.list[0].q));
  console.log(`[1] 메일 ${job.total}통 (목록 ${gmail.calls.list.length}페이지, 동시 최대 ${gmail.calls.maxConcurrent}개, 429 재시도 2회) → ${job.items.length}곳, mode=${job.mode}`);
  console.log(`    단계: ${[...seen].join(' → ')}`);

  // 2) .mbox 분석 결과와 같은 형식·같은 판단 (본문 없이도)
  const fromMbox = (await classifyGroups((await analyzeMailText(mbox)).groups)).items;
  assert.strictEqual(job.items.length, 15, '개인 메일(gmail.com)은 제외되고 15곳');
  assert.ok(!job.items.some((x) => x.domain === 'gmail.com'));
  for (const g of fromMbox) {
    const x = job.items.find((y) => y.domain === g.domain);
    assert.ok(x, g.domain);
    assert.deepStrictEqual(Object.keys(x).sort(), Object.keys(g).sort(), '같은 응답 형식');
    assert.strictEqual(x.risk, g.risk, `${g.service} 위험도`);
    assert.deepStrictEqual(x.signals, g.signals, `${g.service} 신호`);
    assert.strictEqual(x.unsubscribe, g.unsubscribe, `${g.service} 수신거부`);
  }
  const demo = job.items.find((x) => x.domain === 'demo-shop.example');
  assert.strictEqual(demo.settings_url, 'http://localhost:3000/demo-shop/settings.html');
  assert.strictEqual(demo.unsubscribe_one_click, true, 'List-Unsubscribe-Post 원클릭');
  console.log('[2] .mbox 분석과 서비스·위험도·신호·수신거부 링크 모두 동일, 데모쇼핑 settings_url·원클릭 수신거부 O');

  // 3) LLM에 보낼 내용: 도메인·이름·제목·날짜만 (메일 주소·본문 없음)
  const { parseRawMessages, groupByDomain } = require('../server/mbox');
  const { toRawHeaders } = require('../server/gmail');
  const raws = store.map((m) => toRawHeaders({ payload: { headers: m.headers } }));
  assert.ok(raws.every((r) => !/김지우님|본 메일은|주문번호:/.test(r)), 'Gmail 경로에 본문 없음');
  const prompt = buildAnalyzeUser(groupByDomain(await parseRawMessages(raws)), '2026-11-06');
  const promptMbox = buildAnalyzeUser((await analyzeMailText(mbox)).groups, '2026-11-06');
  for (const p of [prompt, promptMbox]) {
    assert.ok(!/@/.test(p), 'LLM 프롬프트에 메일 주소 없음');
    assert.ok(!/김지우님|본 메일은 발신 전용|수신거부:/.test(p), 'LLM 프롬프트에 본문 없음');
  }
  console.log('[3] LLM 프롬프트(Gmail·.mbox 모두): 메일 주소 0개, 본문 0줄');

  // 4) 최대 개수 제한 / 토큰 만료
  const g4 = fakeGmail({ failOnce429: false });
  const j4 = { phase: 'starting', done: 0, total: 0, failed: 0 };
  await runJob(j4, g4, { max: 40 });
  assert.strictEqual(j4.total, 40);
  const g5 = fakeGmail({ failOnce429: false });
  g5.users.messages.get = async () => { const e = new Error('invalid_grant'); e.code = 401; throw e; };
  const j5 = { phase: 'starting', done: 0, total: 0, failed: 0 };
  await runJob(j5, g5, {});
  assert.strictEqual(j5.phase, 'error');
  console.log(`[4] 최대 40통 설정 → ${j4.total}통만 / 토큰 만료 → "${j5.error}"`);

  console.log('\n✅ Gmail 파이프라인 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
