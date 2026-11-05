// 확장 프로그램 로직 검증 (chrome API를 가짜로 만들어 background.js·bridge.js 실행)
// 실행: node scripts/test-extension.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

// ---- background.js ----
function loadBackground({ loadDelay = 30, alreadyComplete = false } = {}) {
  const updated = [];
  let onMessage = null;
  const created = [];
  const chrome = {
    runtime: { onMessage: { addListener: (fn) => { onMessage = fn; } } },
    tabs: {
      onUpdated: { addListener: (fn) => updated.push(fn), removeListener: (fn) => updated.splice(updated.indexOf(fn), 1) },
      create: async ({ url }) => {
        const id = created.length + 1;
        created.push(url);
        if (!alreadyComplete) setTimeout(() => [...updated].forEach((fn) => fn(id, { status: 'complete' })), loadDelay);
        return { id, status: alreadyComplete ? 'complete' : 'loading' };
      },
      get: async (id) => ({ id, status: alreadyComplete ? 'complete' : 'loading' }),
    },
  };
  vm.runInNewContext(read('background.js'), { chrome, URL, setTimeout, clearTimeout, console });
  const send = (msg, sender = { origin: 'http://localhost:3000', url: 'http://localhost:3000/' }) =>
    new Promise((resolve) => {
      const async = onMessage(msg, sender, resolve);
      if (!async) setTimeout(() => resolve('(응답 없음)'), 50);
    });
  return { send, created, listeners: () => updated.length };
}

// ---- bridge.js ----
function loadBridge(reply) {
  const posted = [];
  let handler = null;
  const window = {
    addEventListener: (t, fn) => { handler = fn; },
    postMessage: (msg, origin) => posted.push({ msg: JSON.parse(JSON.stringify(msg)), origin }), // vm 객체 → 일반 객체
  };
  const chrome = { runtime: { lastError: null, sendMessage: (m, cb) => setTimeout(() => cb(reply(m)), 5) } };
  vm.runInNewContext(read('bridge.js'), { window, chrome, location: { origin: 'http://localhost:3000' }, setTimeout });
  const fire = (data, extra = {}) => handler({ source: window, origin: 'http://localhost:3000', data, ...extra });
  return { posted, fire };
}

(async () => {
  // manifest
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.content_scripts[0].js.includes('bridge.js'));
  console.log('manifest: MV3, bridge.js → http://localhost:3000/* (demo-shop 제외)');

  // 1) REVOKE → 새 탭 열고 로딩 완료 후 opened
  const bg = loadBackground();
  const url = 'http://localhost:3000/demo-shop/settings.html';
  const t = Date.now();
  const r1 = await bg.send({ type: 'REVOKE', payload: { settings_url: url } });
  assert.strictEqual(r1.status, 'opened');
  assert.deepStrictEqual(bg.created, [url]);
  assert.ok(Date.now() - t >= 25, '로딩 완료까지 기다림');
  assert.strictEqual(bg.listeners(), 0, '리스너 정리');
  console.log('[1] REVOKE →', JSON.stringify(r1), `(${Date.now() - t}ms 대기)`);

  // 2) 이미 로딩 끝난 탭도 바로 응답
  const r2 = await loadBackground({ alreadyComplete: true }).send({ type: 'REVOKE', payload: { settings_url: url } });
  assert.strictEqual(r2.status, 'opened');
  console.log('[2] 이미 로딩 완료된 탭 →', r2.status);

  // 3) 위험한 주소 거부
  const bg3 = loadBackground();
  const r3 = await bg3.send({ type: 'REVOKE', payload: { settings_url: 'javascript:alert(1)' } });
  assert.strictEqual(r3.status, 'error');
  assert.strictEqual(bg3.created.length, 0);
  console.log('[3] javascript: 주소 →', r3.error);

  // 4) 다른 사이트에서 온 메시지 무시
  const r4 = await bg3.send({ type: 'REVOKE', payload: { settings_url: url } }, { origin: 'https://evil.example' });
  assert.strictEqual(r4, '(응답 없음)');
  assert.strictEqual(bg3.created.length, 0);
  console.log('[4] 다른 출처 메시지 → 무시');

  // 5) bridge: 로드 시 READY, PING에 READY, 요청 중계
  const br = loadBridge((m) => ({ status: 'opened', echo: m.type }));
  assert.deepStrictEqual(br.posted[0].msg, { source: 'cc-ext', type: 'READY' });
  br.fire({ source: 'cc-web', type: 'PING' });
  assert.strictEqual(br.posted[1].msg.type, 'READY');
  br.fire({ source: 'cc-web', type: 'REVOKE', requestId: 'r1', payload: {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepStrictEqual(br.posted[2].msg, { source: 'cc-ext', requestId: 'r1', result: { status: 'opened', echo: 'REVOKE' } });
  assert.strictEqual(br.posted[2].origin, 'http://localhost:3000');
  console.log('[5] bridge: READY 전송, PING 응답, REVOKE 중계 →', JSON.stringify(br.posted[2].msg));

  // 6) bridge: 다른 출처·다른 source 무시
  const before = br.posted.length;
  br.fire({ source: 'cc-web', type: 'REVOKE', requestId: 'x' }, { origin: 'https://evil.example' });
  br.fire({ source: 'other', type: 'REVOKE', requestId: 'y' });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(br.posted.length, before);
  console.log('[6] bridge: 다른 출처/형식 메시지 → 무시');

  console.log('\n✅ 확장 로직 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
