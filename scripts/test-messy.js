// 지저분한 실제 메일함 흉내: 서브도메인·같은 회사 여러 도메인·개인 메일·기관·해외 마케팅·1통짜리
// 실행: node scripts/test-messy.js
const assert = require('assert');
const { parseRawMessages, groupByDomain, baseDomain } = require('../server/mbox');
const { classifyGroups } = require('../server/llm');
const { buildAnalyzeUser } = require('../server/prompts');

let n = 0;
const mail = (from, subject, date, unsub) => [
  `From: ${from}`, `Subject: ${subject}`, `Date: ${date}`, `Message-ID: <m${n++}@x>`,
  unsub ? `List-Unsubscribe: <${unsub}>` : null, unsub ? 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' : null,
].filter(Boolean).join('\r\n') + '\r\n\r\n';
const d = (ymd) => new Date(ymd + 'T10:00:00+09:00').toUTCString();

const RAWS = [
  // 같은 회사 여러 도메인 + 서브도메인 (쿠팡)
  mail('쿠팡 <news@news.coupang.com>', '오늘만 최대 70% 할인', d('2026-10-01'), 'https://u.coupang.com/1'),
  mail('쿠팡 <no-reply@mail.coupang.com>', '주문이 완료되었습니다', d('2024-03-01')),
  mail('쿠팡 <help@coupang.com>', '[쿠팡] 회원가입을 환영합니다', d('2023-01-01')),
  // Facebook: 다른 도메인 두 개
  mail('Facebook <notification@facebookmail.com>', 'You have 3 new notifications', d('2026-10-20'), 'https://fb.example/u'),
  mail('Facebook <security@facebook.com>', 'Security alert: new login', d('2026-09-01')),
  // 해외 마케팅: (광고) 표기 없음
  mail('Netflix <info@mailer.netflix.com>', 'New arrivals this week', d('2026-10-30'), 'https://nf.example/u'),
  mail('Netflix <info@mailer.netflix.com>', "Don't miss these shows", d('2026-09-30'), 'https://nf.example/u'),
  mail('Netflix <info@account.netflix.com>', 'Your payment receipt', d('2026-10-05')),
  // 2단계 도메인 서브도메인
  mail('한국쇼핑 <ad@mail.koreashop.co.kr>', '(광고) 가을 기획전', d('2026-08-01'), 'https://u.koreashop.co.kr/x'),
  mail('한국쇼핑 <ad@email.koreashop.co.kr>', '(광고) 쿠폰 도착', d('2026-07-01'), 'https://u.koreashop.co.kr/y'),
  // 개인 간 메일
  mail('친구 <friend@naver.com>', '주말에 볼래?', d('2026-10-10')),
  mail('동료 <coworker@gmail.com>', '자료 보내드려요', d('2026-10-11')),
  // 기관
  mail('서울대학교 <notice@snu.ac.kr>', '학사 일정 안내', d('2026-09-01')),
  mail('행정안전부 <noreply@mois.go.kr>', '정부24 알림', d('2026-08-01')),
  mail('국민건강보험 <info@nhis.or.kr>', '건강검진 안내', d('2026-07-01')),
  // 1통뿐, 가입 신호 없음 → 확인 필요
  mail('어딘가 <hello@random-startup.io>', '안녕하세요 소개드립니다', d('2026-05-01')),
  // noreply 이름이 같은 서로 다른 회사 → 합치면 안 됨
  mail('noreply <noreply@alpha-svc.com>', '[알파] 회원가입 완료', d('2025-01-01')),
  mail('noreply <noreply@beta-svc.com>', '[베타] 회원가입 완료', d('2025-02-01')),
];

(async () => {
  // 도메인 정리
  assert.strictEqual(baseDomain('news.coupang.com'), 'coupang.com');
  assert.strictEqual(baseDomain('mail.koreashop.co.kr'), 'koreashop.co.kr');
  assert.strictEqual(baseDomain('portal.snu.ac.kr'), 'snu.ac.kr');
  assert.strictEqual(baseDomain('mail.myschool.hs.kr'), 'myschool.hs.kr');
  assert.strictEqual(baseDomain('email.shop.co.jp'), 'shop.co.jp');
  assert.strictEqual(baseDomain('a.b.example.com.au'), 'example.com.au');

  const groups = groupByDomain(await parseRawMessages(RAWS));
  const g = (dom) => groups.find((x) => x.domain === dom);
  assert.ok(!g('naver.com') && !g('gmail.com'), '개인 메일 제외');
  assert.strictEqual(g('koreashop.co.kr').count, 2, '2단계 도메인 서브도메인 합치기');
  assert.strictEqual(g('coupang.com').count, 3, '쿠팡 서브도메인 합치기');
  assert.strictEqual(g('snu.ac.kr').kind, 'institution');
  assert.strictEqual(g('mois.go.kr').kind, 'institution');
  assert.strictEqual(g('nhis.or.kr').kind, 'institution');
  assert.strictEqual(g('netflix.com').counts.promo, 2, '(광고) 없는 해외 마케팅 감지');
  assert.strictEqual(g('facebook.com').counts.security, 1);
  assert.ok(g('random-startup.io').weak);
  // 회사 메일 주소면 그 회사 도메인은 기관
  assert.strictEqual(groupByDomain(await parseRawMessages(RAWS), { selfDomain: 'alpha-svc.com' }).find((x) => x.domain === 'alpha-svc.com').kind, 'institution');
  console.log(`[도메인] 18통 → ${groups.length}그룹 (개인 메일 2통 제외, 서브도메인 합침, 기관 3곳, 확인 필요 1곳)`);

  // 규칙 모드: 같은 이름(Facebook) 합치기, noreply 는 안 합침
  const { items } = await classifyGroups(groups, { client: null, today: '2026-11-06' });
  const it = (name) => items.find((x) => x.service === name);
  assert.deepStrictEqual(it('Facebook').domains.sort(), ['facebook.com', 'facebookmail.com']);
  assert.strictEqual(it('Facebook').mail_count, 2);
  assert.strictEqual(items.filter((x) => x.service === 'noreply').length, 2, 'noreply 는 합치지 않음');
  assert.strictEqual(it('Netflix').marketing_consent, true);
  assert.strictEqual(it('서울대학교').category, '기관');
  assert.strictEqual(it('서울대학교').kind, 'institution');
  assert.strictEqual(it('서울대학교').settings_url, null);
  assert.strictEqual(it('어딘가').risk, 'review');
  assert.strictEqual(items[items.length - 1].risk, 'review', '확인 필요는 맨 아래');
  console.table(items.map((x) => ({ 서비스: x.service, 도메인: x.domains.join(','), 분류: x.category, 메일: x.mail_count, 위험도: x.risk, 광고동의: x.marketing_consent ? 'O' : '-', 근거: x.reason })));

  // LLM 모드: 20개씩 배치, 제목 6개, LLM 서비스명으로 합치기, 기관은 코드가 강제
  const many = [...groups];
  for (let i = 0; i < 12; i++) many.push({ ...groups[0], domain: `extra${i}.example`, domains: [`extra${i}.example`], name: `Extra${i}`, subjects: Array.from({ length: 8 }, (_, k) => `제목 ${k}`) });
  const prompts = [];
  const fake = { messages: { create: async (p) => {
    const content = p.messages[0].content;
    prompts.push(content);
    const arr = JSON.parse(content.slice(content.indexOf('[')));
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(arr.map((x) => ({
      domain: x.domain,
      service: /coupang/.test(x.domain) ? '쿠팡' : /facebook/.test(x.domain) ? 'Facebook' : x.sender_name,
      category: '쇼핑', marketing_consent: true, risk: 'medium', reason: 'LLM 판단',
    }))) }] };
  } } };
  const llm = await classifyGroups(many, { client: fake, today: '2026-11-06' });
  assert.strictEqual(prompts.length, 2, `${many.length}그룹 → 20개씩 2번`);
  for (const p of prompts) {
    const arr = JSON.parse(p.slice(p.indexOf('[')));
    assert.ok(arr.every((x) => x.subjects.length <= 6), '제목 최대 6개');
    assert.ok(!/@/.test(p), '메일 주소 없음');
  }
  const L = (s) => llm.items.find((x) => x.service === s);
  assert.deepStrictEqual(L('Facebook').domains.sort(), ['facebook.com', 'facebookmail.com']);
  assert.strictEqual(L('서울대학교').category, '기관', 'LLM이 쇼핑이라 해도 기관');
  assert.strictEqual(L('어딘가').risk, 'review', 'LLM이 medium이라 해도 확인 필요');
  console.log(`[LLM] ${many.length}그룹 → 호출 ${prompts.length}번(20개씩), 제목 ≤6, Facebook 2도메인 합침, 기관·확인 필요는 코드가 강제`);

  console.log('\n✅ 지저분한 메일함 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
