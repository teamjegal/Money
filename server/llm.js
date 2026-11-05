// LLM 분류 래퍼 + 실패 시 규칙 기반 대체 로직
const Anthropic = require('@anthropic-ai/sdk');
const { ANALYZE_SYSTEM, buildAnalyzeUser, RETRY_HINT } = require('./prompts');
const KNOWN = require('./services.json');
const { mergeByService } = require('./merge');

const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const BATCH = 20; // 도메인 그룹 20개씩 한 번에
const RISK_ORDER = { high: 0, medium: 1, low: 2, review: 3 }; // review: 확인 필요 (낮은 우선순위)
const CATEGORIES = ['쇼핑', '배달', '여행', '영화', '공연', '도서', '교육', '금융', '뉴스', '운동', '중고거래', '반려동물', '인테리어', 'SNS', '기관', '기타'];

// 카테고리 추정용 키워드 (이름 + 제목에서 찾음)
const CATEGORY_HINTS = [
  ['SNS', /facebook|instagram|twitter|linkedin|tiktok|discord|threads|pinterest|reddit|페이스북|인스타그램|카카오스토리/i],
  ['영화', /netflix|youtube|disney|wavve|tving|watcha|coupang ?play|넷플릭스|유튜브|티빙|왓챠/i],
  ['배달', /배달|배고파|음식|치킨/], ['여행', /여행|호텔|숙소|항공|호캉스/], ['영화', /영화|시네마|극장|팝콘/],
  ['공연', /공연|뮤지컬|콘서트|티켓/], ['도서', /책|도서|서점|베스트셀러/], ['교육', /강의|수강|클래스|배움|자격증/],
  ['금융', /가계부|은행|카드|머니|동전|금융/], ['뉴스', /뉴스|레터|소식/], ['운동', /운동|피트|핏|런|헬스/],
  ['중고거래', /중고|장터|거래/], ['반려동물', /반려|멍|냥|사료|펫/], ['인테리어', /인테리어|홈스타일|가구|협탁|뜰/],
  ['쇼핑', /쇼핑|마켓|마트|딜|할인|특가|주문/],
];

const toDate = (s) => (s ? new Date(s + 'T00:00:00+09:00') : null);
const daysBetween = (a, b) => Math.floor((toDate(b) - toDate(a)) / 86400000);
const todayStr = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ---- 규칙 기반 판단 (키 없음 / LLM 실패 시) ----
function guessCategory(g) {
  const hay = `${g.name} ${g.subjects.join(' ')}`;
  return CATEGORY_HINTS.find(([, re]) => re.test(hay))?.[0] || '기타';
}

function ruleJudge(g, today) {
  const base = { domain: g.domain, service: g.name };
  // 학교·공공기관·내 회사: 해제 대상 아님
  if (g.kind === 'institution') {
    return { ...base, category: '기관', marketing_consent: false, risk: 'low', reason: '학교·공공기관·회사 메일이라 해제 대상이 아니에요' };
  }
  const ads = g.counts.ad + (g.counts.promo || 0), sinceOrder = g.last_order ? daysBetween(g.last_order, today) : null;
  const adWord = g.counts.ad ? '광고' : '마케팅·알림성 메일';
  let risk, reason;
  if (g.weak) {
    risk = 'review';
    reason = `메일 ${g.count}통뿐이고 가입·이용 신호가 없어 확인이 필요해요`;
  } else if (g.counts.dormant) {
    risk = 'high';
    reason = `${g.last_dormant} 휴면 전환 안내를 받음` + (ads ? ` · 광고 ${ads}건` : '');
  } else if (ads && (sinceOrder === null || sinceOrder >= 365)) {
    risk = 'high';
    reason = g.last_order
      ? `${adWord}은 ${g.last_ad}까지 오는데 마지막 주문은 ${g.last_order}`
      : `주문 기록 없이 ${adWord}만 ${ads}건 수신`;
  } else if (ads) {
    risk = 'medium';
    reason = `${adWord} 수신 중이고 ${g.last_order}에 주문 기록 있음`;
  } else {
    risk = 'low';
    reason = '광고 없이 정보성 메일만 수신';
  }
  return { ...base, category: guessCategory(g), marketing_consent: ads > 0, risk, reason };
}

// ---- LLM 응답 파싱 ----
function parseJsonArray(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('JSON 배열 없음');
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error('배열 아님');
  return arr;
}

// LLM 결과 한 건 검증: 이상한 값은 규칙 결과로 채운다
function sanitize(item, rule) {
  if (!item || typeof item !== 'object') return rule;
  return {
    domain: rule.domain,
    service: typeof item.service === 'string' && item.service.trim() ? item.service.trim() : rule.service,
    category: CATEGORIES.includes(item.category) ? item.category : rule.category,
    marketing_consent: typeof item.marketing_consent === 'boolean' ? item.marketing_consent : rule.marketing_consent,
    risk: item.risk in RISK_ORDER ? item.risk : rule.risk,
    reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim().slice(0, 120) : rule.reason,
  };
}

function textOf(response) {
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new Error(`LLM 응답 중단: ${response.stop_reason}`);
  }
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// 배치 하나를 LLM으로 판단. 파싱 실패 시 1회 재시도.
async function llmBatch(client, groups, today) {
  const messages = [{ role: 'user', content: buildAnalyzeUser(groups, today) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' }, // 단순 분류라 낮은 effort로 빠르게
      system: ANALYZE_SYSTEM,
      messages,
    });
    const text = textOf(response);
    try {
      const arr = parseJsonArray(text);
      const byDomain = new Map(arr.filter((x) => x && x.domain).map((x) => [String(x.domain).toLowerCase(), x]));
      // 도메인으로 매칭, 없으면 같은 위치의 원소 사용
      return groups.map((g, i) => byDomain.get(g.domain) || arr[i]);
    } catch (e) {
      if (attempt === 1) throw e;
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: RETRY_HINT });
    }
  }
}

function enforce(g, judged) {
  if (g.kind === 'institution') return { ...judged, category: '기관', risk: 'low', marketing_consent: false };
  if (g.weak) return { ...judged, risk: 'review' };
  if (judged.risk === 'review') return { ...judged, risk: 'low' };
  return judged;
}

// 최종 서비스 항목 형식으로 합치기 (사실 정보는 메일에서, 판단은 LLM/규칙에서)
function toServiceItem(g, judged) {
  const known = KNOWN[g.domain] || {};
  return {
    service: known.service || judged.service,
    domain: g.domain,
    domains: g.domains || [g.domain],
    kind: g.kind || 'service', // institution 이면 해제·수신거부 버튼 없음
    needs_review: !!g.weak,
    category: known.category || judged.category,
    signals: g.signals,
    marketing_consent: judged.marketing_consent,
    first_seen: g.first_seen,
    last_seen: g.last_seen,
    risk: judged.risk,
    reason: judged.reason,
    unsubscribe: g.unsubscribe,
    unsubscribe_one_click: !!g.unsubscribe_one_click,
    settings_url: g.kind === 'institution' ? null : known.settings_url || null,
    contact_email: known.contact_email || g.contact_email || null,
    mail_count: g.count,
    subjects: g.subjects,
    judged_by: judged.by,
  };
}

let defaultClient = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // 시연 중 오래 멈추지 않게 타임아웃 짧게
  defaultClient ||= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return defaultClient;
}

// 진입점: 그룹 목록 → 서비스 항목 배열 (위험도순)
async function classifyGroups(groups, opts = {}) {
  const today = opts.today || todayStr();
  const client = opts.client !== undefined ? opts.client : getClient();
  const errors = [];
  const allJudged = [];

  for (let i = 0; i < groups.length; i += BATCH) {
    const batch = groups.slice(i, i + BATCH);
    const rules = batch.map((g) => ruleJudge(g, today));
    let judged = rules.map((r) => ({ ...r, by: 'rules' }));
    if (client) {
      try {
        const raw = await llmBatch(client, batch, today);
        judged = raw.map((x, j) => ({ ...sanitize(x, rules[j]), by: 'llm' }));
      } catch (e) {
        errors.push(e.message);
        console.warn(`[llm] 배치 ${i / BATCH + 1} 실패 → 규칙 기반 대체: ${e.message}`);
      }
    }
    allJudged.push(...judged);
  }
  // 같은 회사(서비스명)끼리 합친 뒤, 규칙 모드면 합친 결과로 다시 판단
  const items = mergeByService(groups, allJudged).map(({ group, judged }) => {
    const j = judged.by === 'rules' ? { ...ruleJudge(group, today), by: 'rules' } : judged;
    return toServiceItem(group, enforce(group, j));
  });
  // llm: 전부 LLM / rules: 키 없음 / rules-fallback: LLM 전부 실패 / mixed: 일부만 실패
  const llmCount = items.filter((x) => x.judged_by === 'llm').length;
  const mode = !client ? 'rules' : llmCount === items.length ? 'llm' : llmCount === 0 ? 'rules-fallback' : 'mixed';

  items.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.mail_count - a.mail_count);
  return { mode, model: client ? MODEL : null, errors, items };
}

module.exports = { classifyGroups, ruleJudge, parseJsonArray, getClient, textOf, MODEL };
