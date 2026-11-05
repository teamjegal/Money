// /api/pick-targets 판단 로직 검증 (데모쇼핑 설정 페이지 스캔 결과 기준)
// 실행: node scripts/test-pick.js
const assert = require('assert');
const { pickTargets } = require('../server/pick');

// extension/scan.js 를 데모쇼핑 settings.html 에서 실행한 실제 결과
const CONTROLS = [
  { id: 'cc-1', kind: 'link', label: '데모쇼핑', disabled: false, href: 'settings.html' },
  { id: 'cc-2', kind: 'link', label: '로그아웃', disabled: false, href: 'index.html?logout' },
  { id: 'cc-6', kind: 'link', label: '쿠폰존', disabled: false, href: '#' },
  { id: 'cc-8', kind: 'checkbox', label: '주문·배송 알림 필수', checked: true, disabled: true },
  { id: 'cc-9', kind: 'checkbox', label: '이메일 광고 수신 동의 할인 쿠폰, 기획전 소식을 이메일로 받습니다.', checked: true, disabled: false },
  { id: 'cc-10', kind: 'checkbox', label: 'SMS 광고 수신 동의 문자로 타임특가 알림을 받습니다.', checked: true, disabled: false },
  { id: 'cc-11', kind: 'checkbox', label: '앱 푸시 혜택·이벤트 알림', checked: true, disabled: false },
  { id: 'cc-12', kind: 'checkbox', label: '야간 광고 수신 동의 오후 9시 ~ 오전 8시 사이 광고성 알림 수신', checked: true, disabled: false },
  { id: 'cc-13', kind: 'checkbox', label: '맞춤형 광고를 위한 개인정보 이용 동의', checked: true, disabled: false },
  { id: 'cc-14', kind: 'button', label: '저장하기', disabled: false },
  { id: 'cc-15', kind: 'button', label: '취소', disabled: false },
  { id: 'cc-16', kind: 'link', label: '회원 탈퇴', disabled: false, href: '#' },
  { id: 'cc-17', kind: 'link', label: '데모 초기화 시연 반복용', disabled: false, href: '#' },
];
const AD5 = ['cc-9', 'cc-10', 'cc-11', 'cc-12', 'cc-13'];
const FORBIDDEN = ['cc-2', 'cc-8', 'cc-15', 'cc-16'];

const fake = (text) => ({ messages: { create: async () => {
  if (text instanceof Error) throw text;
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
} } });
const ids = (r) => r.targets.map((t) => t.id).sort();
const check = (name, r) => {
  assert.deepStrictEqual(ids(r), [...AD5].sort(), `${name}: 광고 5개`);
  assert.strictEqual(r.save_id, 'cc-14', `${name}: 저장 버튼`);
  assert.ok(!r.targets.some((t) => FORBIDDEN.includes(t.id)) && !FORBIDDEN.includes(r.save_id), `${name}: 금지 항목 없음`);
  console.log(`[${name}] mode=${r.mode} → ${ids(r).join(', ')} + 저장 ${r.save_id}`);
};

(async () => {
  // 1) 키 없음 → 키워드 규칙
  const r1 = await pickTargets({ url: 'x', controls: CONTROLS }, { client: null });
  check('키 없음', r1);
  console.log('   근거:', r1.targets.map((t) => t.reason).join(' / '));

  // 2) LLM 정상
  check('LLM 정상', await pickTargets({ controls: CONTROLS }, { client: fake(JSON.stringify({
    targets: AD5.map((id) => ({ id, reason: '광고 수신' })), save_id: 'cc-14' })) }));

  // 3) LLM이 위험·필수·없는 id를 섞어도 코드가 걸러냄 (탈퇴를 저장 버튼으로 골라도)
  const evil = { targets: [...AD5, 'cc-8', 'cc-16', 'cc-2', 'cc-99', 'cc-14'].map((id) => ({ id })), save_id: 'cc-16' };
  const r3 = await pickTargets({ controls: CONTROLS }, { client: fake('```json\n' + JSON.stringify(evil) + '\n```') });
  check('LLM 오판 걸러내기', r3);

  // 4) 응답이 JSON 아님 (재시도도 실패) → 규칙
  check('LLM 깨진 응답', await pickTargets({ controls: CONTROLS }, { client: fake('죄송합니다') }));

  // 5) 네트워크 오류 → 규칙
  check('LLM 오류', await pickTargets({ controls: CONTROLS }, { client: fake(new Error('ECONNRESET')) }));

  // 6) 이미 꺼진 토글은 대상 아님 / 서버 안전 필터: 확장이 안 걸러 보낸 위험 토글도 제외
  const r6 = await pickTargets({ controls: [
    ...CONTROLS.map((c) => (c.id === 'cc-10' ? { ...c, checked: false } : c)),
    { id: 'cc-50', kind: 'checkbox', label: '광고 수신 동의 후 회원 탈퇴', checked: true, disabled: false },
  ] }, { client: null });
  assert.ok(!ids(r6).includes('cc-10') && !ids(r6).includes('cc-50'));
  console.log(`[꺼진 토글·위험 토글] → ${ids(r6).join(', ')}`);

  console.log('\n✅ pick-targets 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
