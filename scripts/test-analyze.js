// /api/analyze 판단 로직 확인 스크립트
// 실행: node scripts/test-analyze.js        (키 없음 + 가짜 LLM 시나리오)
//       .env 에 ANTHROPIC_API_KEY 가 있으면 실제 LLM 결과도 비교 출력
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { analyzeMailText } = require('../server/mbox');
const { classifyGroups, ruleJudge } = require('../server/llm');

const TODAY = '2026-11-05';
const show = (items) => console.table(items.map((x) => ({
  위험도: x.risk, 서비스: x.service, 분류: x.category, 광고동의: x.marketing_consent ? 'O' : '-',
  근거: x.reason, 설정페이지: x.settings_url ? 'O' : '-', 판단: x.judged_by,
})));

// 가짜 LLM: 호출마다 정해진 응답을 돌려준다
function fakeClient(replies) {
  let n = 0;
  return {
    calls: () => n,
    messages: {
      create: async (params) => {
        const r = replies[Math.min(n++, replies.length - 1)];
        if (r instanceof Error) throw r;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof r === 'function' ? r(params) : r }] };
      },
    },
  };
}
// 입력 그룹을 읽어 그럴듯한 LLM 응답(JSON) 생성
const goodReply = (groups) => (params) => {
  const domains = [...params.messages[0].content.matchAll(/"domain":\s*"([^"]+)"/g)].map((m) => m[1]);
  const arr = domains.map((d) => {
    const r = ruleJudge(groups.find((g) => g.domain === d), TODAY);
    return { ...r, reason: `[LLM] ${r.reason}` };
  });
  return '```json\n' + JSON.stringify(arr) + '\n```';
};

(async () => {
  const mbox = fs.readFileSync(path.join(__dirname, '..', 'samples', 'demo.mbox'), 'utf8');
  const { groups } = await analyzeMailText(mbox);

  // 1) 키 없음 → 규칙 기반
  const a = await classifyGroups(groups, { client: null, today: TODAY });
  console.log(`\n[1] 키 없음 → mode=${a.mode}`);
  show(a.items);
  const demo = a.items.find((x) => x.domain === 'demo-shop.example');
  assert.strictEqual(a.mode, 'rules');
  assert.strictEqual(a.items.length, 15);
  assert.strictEqual(demo.settings_url, 'http://localhost:3000/demo-shop/settings.html');
  assert.strictEqual(demo.contact_email, 'privacy@demo-shop.example');
  assert.strictEqual(demo.risk, 'high');
  const order = a.items.map((x) => x.risk).join(',');
  assert.ok(/^(high,)*(medium,)*(low,?)*$/.test(order + ','), '위험도순 정렬');

  // 2) 가짜 LLM 정상 응답 (코드블록 감싸도 파싱)
  const c2 = fakeClient([goodReply(groups)]);
  const b = await classifyGroups(groups, { client: c2, today: TODAY });
  console.log(`\n[2] 가짜 LLM 정상 → mode=${b.mode}, 호출 ${c2.calls()}회 (20개씩 배치)`);
  assert.strictEqual(b.mode, 'llm');
  assert.strictEqual(c2.calls(), 1); // 15그룹 → 20개씩 배치라 1번
  assert.ok(b.items.every((x) => x.reason.startsWith('[LLM]')));

  // 3) 첫 응답 깨짐 → 재시도 성공
  const c3 = fakeClient(['죄송하지만 결과는 다음과 같습니다: {깨진', goodReply(groups)]);
  const c = await classifyGroups(groups.slice(0, 5), { client: c3, today: TODAY });
  console.log(`[3] 첫 응답 깨짐 → 재시도: mode=${c.mode}, 호출 ${c3.calls()}회`);
  assert.strictEqual(c.mode, 'llm');
  assert.strictEqual(c3.calls(), 2);

  // 4) 두 번 다 깨짐 → 규칙 기반 대체
  const c4 = fakeClient(['not json']);
  const d = await classifyGroups(groups.slice(0, 5), { client: c4, today: TODAY });
  console.log(`[4] 두 번 깨짐 → mode=${d.mode}, 호출 ${c4.calls()}회`);
  assert.strictEqual(d.mode, 'rules-fallback');

  // 5) 네트워크 오류 → 규칙 기반 대체
  const e = await classifyGroups(groups, { client: fakeClient([new Error('ECONNRESET')]), today: TODAY });
  console.log(`[5] 네트워크 오류 → mode=${e.mode}, 결과 ${e.items.length}개`);
  assert.strictEqual(e.items.length, 15);

  // 6) 이상한 값(risk 오타, category 엉뚱) → 해당 필드만 규칙 값으로
  const bad = JSON.stringify(groups.slice(0, 2).map((g) => ({ domain: g.domain, service: 'X', risk: 'HIGH!!', category: '우주', marketing_consent: 'yes', reason: '' })));
  const f = await classifyGroups(groups.slice(0, 2), { client: fakeClient([bad]), today: TODAY });
  console.log(`[6] 이상한 값 → service=${f.items[0].service}, risk=${f.items[0].risk}, category=${f.items[0].category}`);
  assert.ok(f.items.every((x) => x.risk in { high: 1, medium: 1, low: 1 }));

  // 7) 실제 LLM (키가 있을 때만)
  if (process.env.ANTHROPIC_API_KEY) {
    const t = Date.now();
    const real = await classifyGroups(groups, { today: TODAY });
    console.log(`\n[7] 실제 LLM (${real.model}) → mode=${real.mode}, ${((Date.now() - t) / 1000).toFixed(1)}초`);
    show(real.items);
    const diff = real.items.filter((x) => a.items.find((y) => y.domain === x.domain).risk !== x.risk);
    console.log(`규칙 기반과 위험도가 다른 항목: ${diff.length ? diff.map((x) => x.service).join(', ') : '없음'}`);
  } else {
    console.log('\n[7] ANTHROPIC_API_KEY 없음 → 실제 LLM 비교 생략');
  }
  console.log('\n✅ 모든 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
