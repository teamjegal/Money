// server/mbox.js 동작 확인용 스크립트
// 실행: node scripts/test-mbox.js [mbox 경로]
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { analyzeMailText, baseDomain } = require('../server/mbox');

(async () => {
  // 1) 샘플 mbox
  const file = process.argv[2] || path.join(__dirname, '..', 'samples', 'demo.mbox');
  const { total, groups } = await analyzeMailText(fs.readFileSync(file, 'utf8'));
  console.log(`\n[1] ${path.basename(file)}: 메일 ${total}통 → 그룹 ${groups.length}개\n`);
  console.table(groups.map((g) => ({
    서비스: g.name, 도메인: g.domain, 메일: g.count, 처음: g.first_seen, 마지막: g.last_seen,
    마지막주문: g.last_order || '-', 마지막광고: g.last_ad || '-', 신호: g.signals.join(', '),
    수신거부: g.unsubscribe ? 'O' : '-',
  })));
  const demo = groups.find((g) => g.domain === 'demo-shop.example');
  console.log('\n데모쇼핑 상세:', JSON.stringify({ ...demo, snippets: undefined }, null, 2));

  // 2) 붙여넣기 + 서브도메인 합치기
  const pasted = [
    'From: 하늘마켓 <news@mail.haneulmarket.example>\nSubject: (광고) 주말 특가\nDate: Mon, 3 Mar 2025 10:00:00 +0900\n\n특가 안내입니다.',
    'From: 하늘마켓 <order@haneulmarket.example>\nSubject: 주문이 완료되었습니다\nDate: Tue, 4 Mar 2025 10:00:00 +0900\n\n결제 완료',
    '보낸사람: 코리아샵 <hello@news.koreashop.co.kr>\n제목: 회원가입을 환영합니다\n날짜: Wed, 5 Mar 2025 10:00:00 +0900\n\n가입이 완료되었습니다.',
  ].join('\n\n\n');
  const p = await analyzeMailText(pasted);
  console.log(`\n[2] 붙여넣기: 메일 ${p.total}통 → 그룹 ${p.groups.length}개`);
  console.table(p.groups.map((g) => ({ 서비스: g.name, 도메인: g.domain, 메일: g.count, 신호: g.signals.join(', ') })));

  // 3) 헤더 한 줄 없는 본문만 붙여넣기
  const bare = await analyzeMailText('안녕하세요 회원님, 장기 미이용으로 휴면 전환 예정입니다.\n문의: help@sleepy.example');
  console.log(`\n[3] 본문만: ${bare.groups.map((g) => `${g.domain} / ${g.signals}`).join('')}`);

  // 검증
  assert.strictEqual(groups.length, 15, '그룹 15개');
  assert.strictEqual(demo.count, 15);
  assert.strictEqual(demo.counts.ad, 10);
  assert.strictEqual(demo.last_order, '2024-01-20');
  assert.strictEqual(demo.contact_email, 'privacy@demo-shop.example');
  assert.ok(groups.filter((g) => g.counts.ad).every((g) => g.unsubscribe?.startsWith('https://unsubscribe.')));
  assert.strictEqual(baseDomain('mail.shop.co.kr'), 'shop.co.kr');
  assert.strictEqual(p.groups.length, 2, '서브도메인 합치기');
  assert.strictEqual(p.groups[0].count, 2);
  assert.strictEqual(bare.groups[0].counts.dormant, 1);
  console.log('\n✅ 모든 검증 통과');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
