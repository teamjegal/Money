// 확장 프로그램 로직 검증 (chrome API를 가짜로 만들어 background.js·bridge.js 실행)
// 실행: node scripts/test-extension.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { pickTargets } = require('../server/pick');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const plain = (o) => JSON.parse(JSON.stringify(o)); // vm 객체 → 일반 객체
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 데모쇼핑 settings.html 을 scan.js 로 읽은 결과 (브라우저에서 확인한 실제 값)
const SCAN_OK = { status: 'ok', url: 'http://localhost:3000/demo-shop/settings.html', controls: [
  { id: 'cc-2', kind: 'link', label: '로그아웃', disabled: false, href: 'index.html?logout', via: 'own-text' },
  { id: 'cc-8', kind: 'checkbox', label: '주문·배송 알림 필수', checked: true, disabled: true, via: 'label-for' },
  { id: 'cc-9', kind: 'checkbox', label: '이메일 광고 수신 동의 할인 쿠폰, 기획전 소식을 이메일로 받습니다.', checked: true, disabled: false, via: 'label-wrap' },
  { id: 'cc-10', kind: 'checkbox', label: 'SMS 광고 수신 동의 문자로 타임특가 알림을 받습니다.', checked: true, disabled: false, via: 'nearby-text' },
  { id: 'cc-11', kind: 'checkbox', label: '앱 푸시 혜택·이벤트 알림', checked: true, disabled: false, via: 'aria-labelledby' },
  { id: 'cc-12', kind: 'checkbox', label: '야간 광고 수신 동의 오후 9시 ~ 오전 8시 사이 광고성 알림 수신', checked: true, disabled: false, via: 'label-wrap' },
  { id: 'cc-13', kind: 'checkbox', label: '맞춤형 광고를 위한 개인정보 이용 동의', checked: true, disabled: false, via: 'label-for' },
  { id: 'cc-14', kind: 'button', label: '저장하기', disabled: false, via: 'own-text' },
  { id: 'cc-15', kind: 'button', label: '취소', disabled: false, via: 'own-text' },
  { id: 'cc-16', kind: 'link', label: '회원 탈퇴', disabled: false, href: '#', via: 'own-text' },
] };
const AD5 = ['cc-10', 'cc-11', 'cc-12', 'cc-13', 'cc-9'];

// ---- background.js ----
// scans: executeScript 호출마다 차례로 돌려줄 스캔 결과
// server: 가짜 서버 (기본은 실제 server/pick.js 규칙 로직)
function loadBackground({ alreadyComplete = false, scans = [SCAN_OK], server, tabUrl = 'https://www.coupang.com/my/notification', overlay = (plan) => ({ status: 'done', changed: plan.targets.map((t) => t.short), failed: [], saved: true }) } = {}) {
  const updated = [], removed = [], created = [], sentToServer = [], plans = [], focused = [], notices = [], badges = [], webMsgs = [], session = {};
  let onMessage = null, scanCount = 0;
  const fireComplete = (id) => [...updated].forEach((fn) => fn(id, { status: 'complete' }));
  const chrome = {
    runtime: { id: 'EXT', onMessage: { addListener: (fn) => { onMessage = fn; } }, getPlatformInfo: (cb) => cb({}) },
    action: { setBadgeText: async (o) => { badges.push(o); }, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    storage: { session: { set: async (o) => Object.assign(session, o), get: async (k) => ({ [k]: session[k] }), remove: async (k) => { delete session[k]; } } },
    tabs: {
      onUpdated: { addListener: (fn) => updated.push(fn), removeListener: (fn) => updated.splice(updated.indexOf(fn), 1) },
      onRemoved: { addListener: (fn) => removed.push(fn), removeListener: (fn) => removed.splice(removed.indexOf(fn), 1) },
      create: async ({ url }) => {
        const id = created.length + 1;
        created.push(url);
        if (!alreadyComplete) setTimeout(() => fireComplete(id), 30);
        return { id, status: alreadyComplete ? 'complete' : 'loading' };
      },
      get: async (id) => ({ id, url: tabUrl, status: alreadyComplete ? 'complete' : 'loading' }),
      query: async (q) => (q.url === 'http://localhost:3000/*' ? [{ id: 99 }] : []),
      sendMessage: async (id, m) => { webMsgs.push({ id, m: plain(m) }); },
      update: async (id, p) => { focused.push({ id, ...p }); return {}; },
    },
    scripting: {
      executeScript: async ({ files, func, args }) => {
        if (func && typeof args[0] === 'string') { notices.push(args[0]); return [{ result: null }]; } // 안내 배너
        if (func) { plans.push(plain(args[0])); return [{ result: await overlay(plain(args[0])) }]; } // 승인 배너
        if (plain(files)[0] === 'overlay.js') return [{ result: 'ready' }];
        assert.deepStrictEqual(plain(files), ['scan.js']);
        return [{ result: scans[Math.min(scanCount++, scans.length - 1)] }];
      },
    },
    _update: null,
  };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sentToServer.push({ url, body });
    const r = server ? server(body) : await pickTargets(body, { client: null });
    return { ok: true, json: async () => r, headers: { get: () => (server ? 'fake' : r.mode) } };
  };
  const quiet = { log: () => {}, warn: console.warn, error: console.error };
  const ctx = vm.createContext({ chrome, fetch, URL, setTimeout, clearTimeout, setInterval, clearInterval, console: quiet });
  ctx.importScripts = (...files) => files.forEach((x) => vm.runInContext(read(x), ctx));
  vm.runInContext(read('background.js'), ctx);
  const baseRemoved = removed.length; // 탭 닫힘 정리용 상시 리스너
  const send = (msg, sender = { id: 'EXT', origin: 'http://localhost:3000', url: 'http://localhost:3000/', tab: { id: 99 } }) =>
    new Promise((resolve) => {
      const async = onMessage(msg, sender, (r) => resolve(plain(r)));
      if (!async) setTimeout(() => resolve('(응답 없음)'), 50);
    });
  const fromPopup = { id: 'EXT', url: 'chrome-extension://EXT/popup.html' };
  return { send, fromPopup, created, sentToServer, plans, focused, notices, badges, webMsgs, session, fireComplete, scanCount: () => scanCount, listeners: () => updated.length + removed.length - baseRemoved };
}

// ---- bridge.js ----
function loadBridge(reply) {
  const posted = [];
  let handler = null;
  const window = {
    addEventListener: (t, fn) => { handler = fn; },
    postMessage: (msg, origin) => posted.push({ msg: plain(msg), origin }),
  };
  let onMsg = null;
  const chrome = { runtime: { id: 'EXT', lastError: null, onMessage: { addListener: (fn) => { onMsg = fn; } }, sendMessage: (m, cb) => setTimeout(() => cb(reply(m)), 5) } };
  vm.runInNewContext(read('bridge.js'), { window, chrome, location: { origin: 'http://localhost:3000' }, setTimeout });
  const fire = (data, extra = {}) => handler({ source: window, origin: 'http://localhost:3000', data, ...extra });
  return { posted, fire, fromBg: (m, sender = { id: 'EXT' }) => onMsg(m, sender) };
}

(async () => {
  const url = SCAN_OK.url;
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('scripting'));
  console.log('manifest: MV3, scripting 권한, bridge.js → http://localhost:3000/* (demo-shop 제외)');

  // 1) REVOKE → 스캔 → 안전 필터 → 서버 → 승인 배너(계획 전달) → 승인 → done → 체크리스트 탭으로
  const bg = loadBackground();
  const r1 = await bg.send({ type: 'REVOKE', payload: { settings_url: url } });
  const plan = bg.plans[0];
  assert.deepStrictEqual(plan.targets.map((t) => t.id).sort(), AD5, '배너에 광고 5개');
  assert.strictEqual(plan.save_id, 'cc-14');
  assert.deepStrictEqual(plan.removed, ['로그아웃', '회원 탈퇴']);
  assert.deepStrictEqual(plan.targets.map((t) => t.short), ['이메일 광고 수신', 'SMS 광고 수신', '앱 푸시 혜택·이벤트 알림', '야간 광고 수신', '맞춤형 광고를 위한 개인정보 이용 동의']);
  const sentLabels = bg.sentToServer[0].body.controls.map((c) => c.label);
  assert.ok(!sentLabels.some((l) => /탈퇴|로그아웃/.test(l)), '서버로 위험 요소를 보내지 않음');
  assert.ok(!bg.sentToServer[0].body.controls.some((c) => 'via' in c || 'href' in c));
  assert.strictEqual(r1.status, 'done');
  assert.strictEqual(r1.changed.length, 5);
  await sleep(1900);
  assert.deepStrictEqual(bg.focused, [{ id: 99, active: true }], '성공하면 체크리스트 탭으로 돌아감');
  assert.strictEqual(bg.listeners(), 0, '리스너 정리');
  console.log(`[1] REVOKE → 배너 ${plan.targets.length}개 + 저장 "${plan.save_label}" → 승인 → ${r1.status}: ${r1.changed.join(' / ')}`);
  console.log(`    안전 필터로 서버 전송 전 제외: ${plan.removed.join(', ')} · 체크리스트 탭으로 복귀`);

  // 2) 취소 / 일부 실패 (실패면 설정 탭에 남음)
  const rc = await loadBackground({ overlay: () => ({ status: 'cancelled', reason: 'user' }) }).send({ type: 'REVOKE', payload: { settings_url: url } });
  assert.strictEqual(rc.status, 'cancelled');
  const bgF = loadBackground({ overlay: () => ({ status: 'done', changed: ['이메일 광고 수신'], failed: ['SMS 광고 수신'], saved: true }) });
  const rf = await bgF.send({ type: 'REVOKE', payload: { settings_url: url } });
  await sleep(1900);
  assert.deepStrictEqual(rf.failed, ['SMS 광고 수신']);
  assert.strictEqual(bgF.focused.length, 0, '실패 항목이 있으면 설정 탭에 머묾');
  console.log('[2] 취소 →', rc.status, '/ 일부 실패 →', rf.failed, '(설정 탭 유지)');

  // 3) 로그인 페이지 → 사용자가 로그인(페이지 이동)하면 다시 스캔
  const bg3 = loadBackground({ scans: [{ status: 'need_login', url: 'http://localhost:3000/demo-shop/index.html' }, SCAN_OK] });
  const p3 = bg3.send({ type: 'REVOKE', payload: { settings_url: url } });
  await sleep(120);
  assert.strictEqual(bg3.scanCount(), 1, '로그인 전에는 한 번만 스캔하고 대기');
  assert.strictEqual(bg3.plans.length, 0, '로그인 전에는 배너 없음');
  bg3.fireComplete(1); // 사용자가 로그인 → settings.html 로 이동 완료
  const r3 = await p3;
  assert.strictEqual(r3.status, 'done');
  assert.strictEqual(bg3.scanCount(), 2);
  console.log('[3] 로그인 페이지 감지 → 대기 → 로그인 후 재스캔 → 배너 → ', r3.status);

  // 4) 서버가 위험·없는 id를 돌려줘도 확장이 다시 거른다 (배너에 안 나감)
  const bg4 = loadBackground({ server: () => ({ targets: [{ id: 'cc-9' }, { id: 'cc-16' }, { id: 'cc-8' }, { id: 'cc-77' }], save_id: 'cc-16' }) });
  await bg4.send({ type: 'REVOKE', payload: { settings_url: url } });
  assert.deepStrictEqual(bg4.plans[0].targets.map((t) => t.id), ['cc-9']);
  assert.strictEqual(bg4.plans[0].save_id, null);
  console.log('[4] 서버가 탈퇴·필수·없는 id 반환 → 배너에는', bg4.plans[0].targets.map((t) => t.id), 'save_id', bg4.plans[0].save_id);

  // 4-2) 저장하면서 페이지가 새로 로드돼 오버레이가 끊김 → 다시 읽어서 라벨로 검증
  const offScan = { ...SCAN_OK, controls: SCAN_OK.controls.map((c) => (AD5.includes(c.id) ? { ...c, checked: false } : c)) };
  const bgR = loadBackground({ scans: [SCAN_OK, offScan], overlay: () => { throw new Error('Frame was removed'); } });
  const pR = bgR.send({ type: 'REVOKE', payload: { settings_url: url } });
  await sleep(80); bgR.fireComplete(1);
  const rR = await pR;
  assert.strictEqual(rR.status, 'done'); assert.strictEqual(rR.changed.length, 5); assert.ok(rR.reloaded);
  console.log('[4-2] 저장 후 페이지 새로고침 → 재스캔 검증 →', rR.status, `${rR.changed.length}개`);

  // 5) 위험한 주소 거부 / 6) 다른 출처 무시
  const bg5 = loadBackground();
  const r5 = await bg5.send({ type: 'REVOKE', payload: { settings_url: 'javascript:alert(1)' } });
  assert.strictEqual(r5.status, 'error');
  assert.strictEqual(await bg5.send({ type: 'REVOKE', payload: { settings_url: url } }, { id: 'EXT', origin: 'https://evil.example' }), '(응답 없음)');
  assert.strictEqual(bg5.created.length, 0);
  console.log('[5] javascript: 주소 →', r5.error, '/ [6] 다른 출처 메시지 → 무시');

  // 8) 팝업 → 현재 탭(실제 사이트): 배너 직전에 팝업에 응답, 승인 결과는 체크리스트 탭에 도메인과 함께
  const bgP = loadBackground();
  const rp = await bgP.send({ type: 'SCAN_ACTIVE', tabId: 7 }, bgP.fromPopup);
  assert.deepStrictEqual(rp, { status: 'banner', count: 5 });
  await sleep(30);
  assert.strictEqual(bgP.created.length, 0, '새 탭 안 열고 현재 탭에서');
  assert.strictEqual(bgP.webMsgs[0].m.type, 'REVOKED');
  assert.strictEqual(bgP.webMsgs[0].m.host, 'www.coupang.com');
  assert.strictEqual(bgP.webMsgs[0].m.result.changed.length, 5);
  console.log('[8] 팝업 → 현재 탭 스캔 → 배너 → 승인 → 체크리스트에 REVOKED(www.coupang.com, 5개)');

  // 9) 팝업: 대상 없음 → 안내 배너 + 팝업 메시지 / 로그인 화면 / 웹 아닌 페이지 / 웹페이지에서 SCAN_ACTIVE 요청은 거절
  const none = loadBackground({ server: () => ({ targets: [], save_id: null }) });
  const rn = await none.send({ type: 'SCAN_ACTIVE', tabId: 7 }, none.fromPopup);
  assert.strictEqual(rn.status, 'none');
  assert.match(rn.message, /광고 수신 항목을 찾지 못했어요/);
  assert.match(none.notices[0], /마케팅 설정 페이지인지/);
  const lg = loadBackground({ scans: [{ status: 'need_login' }] });
  assert.strictEqual((await lg.send({ type: 'SCAN_ACTIVE', tabId: 7 }, lg.fromPopup)).status, 'need_login');
  const cr = loadBackground({ tabUrl: 'chrome://extensions' });
  assert.strictEqual((await cr.send({ type: 'SCAN_ACTIVE', tabId: 7 }, cr.fromPopup)).status, 'error');
  const scansBefore = bgP.scanCount();
  assert.match((await bgP.send({ type: 'SCAN_ACTIVE', tabId: 7 })).error, /알 수 없는 요청/, '웹페이지는 SCAN_ACTIVE 못 보냄');
  assert.strictEqual(bgP.scanCount(), scansBefore, '스캔도 안 함');
  console.log('[9] 대상 없음 → 페이지 안내 배너 + 팝업 메시지 / 로그인 화면·chrome:// 페이지 처리 / 웹에서 SCAN_ACTIVE 거절');

  // 10) GUIDE: settings_url 없는 서비스 → 홈페이지 새 탭 + 아이콘 "?" + 팝업 안내 정보
  const gd = loadBackground();
  const rg = await gd.send({ type: 'GUIDE', payload: { service: '쿠팡', domain: 'coupang.com' } });
  assert.strictEqual(rg.status, 'guided');
  assert.deepStrictEqual(gd.created, ['https://coupang.com/']);
  assert.strictEqual(gd.badges[0].text, '?');
  assert.deepStrictEqual(plain(gd.session['guide:1']), { service: '쿠팡', domain: 'coupang.com' });
  assert.strictEqual((await gd.send({ type: 'GUIDE', payload: { domain: 'javascript:alert(1)' } })).status, 'error');
  console.log('[10] GUIDE → https://coupang.com/ 새 탭, 아이콘 "?", 팝업 안내 저장 / 이상한 도메인 거절');

  // 11) REVOKE 흐름에서도 대상이 없으면 페이지 안내 배너
  const rv = loadBackground({ server: () => ({ targets: [], save_id: null }) });
  await rv.send({ type: 'REVOKE', payload: { settings_url: url } });
  assert.strictEqual(rv.notices.length, 1);
  console.log('[11] REVOKE 대상 없음 → 페이지 안내 배너');

  // 7) bridge: 로드 시 READY, PING에 READY, 요청 중계, 다른 출처 무시
  const br = loadBridge((m) => ({ status: 'picked', echo: m.type }));
  assert.deepStrictEqual(br.posted[0].msg, { source: 'cc-ext', type: 'READY' });
  br.fire({ source: 'cc-web', type: 'PING' });
  br.fire({ source: 'cc-web', type: 'REVOKE', requestId: 'r1', payload: {} });
  br.fire({ source: 'cc-web', type: 'REVOKE', requestId: 'x' }, { origin: 'https://evil.example' });
  br.fire({ source: 'other', type: 'REVOKE', requestId: 'y' });
  await sleep(20);
  assert.strictEqual(br.posted.length, 3);
  assert.deepStrictEqual(br.posted[2].msg, { source: 'cc-ext', requestId: 'r1', result: { status: 'picked', echo: 'REVOKE' } });
  br.fromBg({ type: 'REVOKED', host: 'www.coupang.com', result: { changed: ['a'] } });
  br.fromBg({ type: 'REVOKED', host: 'x' }, { id: 'OTHER' });
  assert.deepStrictEqual(br.posted[3].msg, { source: 'cc-ext', type: 'REVOKED', host: 'www.coupang.com', result: { changed: ['a'] } });
  assert.strictEqual(br.posted.length, 4, '다른 확장 메시지는 무시');
  console.log('[7] bridge: READY·PING·중계 정상, REVOKED 전달, 다른 출처/형식 무시');

  console.log('\n✅ 확장 로직 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
