// 원클릭 수신거부(RFC 8058) 안전장치·요청 형식 검증 (실제 외부로 요청 보내지 않음)
// 실행: node scripts/test-unsubscribe.js
const assert = require('assert');
const { EventEmitter } = require('events');
const { checkUrl, isBlockedIp, safeLookup, oneClickPost, register, clear, unsubscribeOneClick, lookupEntry } = require('../server/unsubscribe');
const { parseRawMessages, groupByDomain } = require('../server/mbox');

// 가짜 https.request: 요청 내용을 기록하고, lookup을 실제로 불러 DNS 검사를 거치게 한다
function fakeRequest(status, hostIp) {
  const calls = [];
  const request = (opts, onRes) => {
    const req = new EventEmitter();
    let body = '';
    req.end = (b) => {
      body = b;
      opts.lookup(opts.hostname, {}, (err) => {
        if (err) return req.emit('error', err);
        calls.push({ opts, body });
        const res = new EventEmitter(); res.statusCode = status; res.resume = () => {};
        onRes(res);
      });
    };
    req.destroy = (e) => req.emit('error', e);
    return req;
  };
  const lookup = (h, o, cb) => cb(null, [{ address: hostIp, family: 4 }]);
  return { request, lookup, calls };
}

(async () => {
  // 1) URL 검사
  const bad = ['http://u.example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://192.168.0.5/x',
    'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://2130706433/x', 'https://a.local/x', 'https://u.example.com:8443/x',
    'https://user:pw@u.example.com/x', 'javascript:alert(1)', 'mailto:x@y.z'];
  for (const u of bad) assert.throws(() => checkUrl(u), `차단돼야 함: ${u}`);
  assert.ok(checkUrl('https://unsubscribe.example.com/u?id=1'));
  console.log(`[1] 차단 ${bad.length}종: http·localhost·127/10/192.168/169.254·::1·10진수 IP·.local·다른 포트·계정정보·javascript·mailto`);

  // 2) IP 판정
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '192.168.1.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.ok(isBlockedIp(ip), ip);
  for (const ip of ['8.8.8.8', '142.250.1.1', '2607:f8b0::1']) assert.ok(!isBlockedIp(ip), ip);
  console.log('[2] 사설·루프백·링크로컬·CGNAT·IPv6 ULA/링크로컬·IPv4 매핑 차단, 공인 IP 허용');

  // 3) 공인 주소: POST 형식 확인
  const ok = fakeRequest(200, '93.184.216.34');
  const r = await oneClickPost('https://unsubscribe.example.com/u?id=abc', ok);
  assert.ok(r.ok);
  const c = ok.calls[0];
  assert.strictEqual(c.opts.method, 'POST');
  assert.strictEqual(c.body, 'List-Unsubscribe=One-Click');
  assert.strictEqual(c.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.strictEqual(c.opts.path, '/u?id=abc');
  assert.strictEqual(c.opts.port, 443);
  console.log(`[3] POST ${c.opts.hostname}${c.opts.path} body="${c.body}" → HTTP 200 성공`);

  // 4) DNS가 사설 IP로 풀리면(리바인딩) 연결 전에 차단
  const rebind = fakeRequest(200, '192.168.0.10');
  await assert.rejects(oneClickPost('https://evil.example.com/u', rebind), /내부·사설 IP/);
  assert.strictEqual(rebind.calls.length, 0, '요청이 나가지 않음');
  console.log('[4] 공개 도메인이 사설 IP로 풀림 → 연결 전에 차단');

  // 5) 실패 응답(4xx/3xx)은 성공으로 치지 않음
  assert.strictEqual((await oneClickPost('https://u.example.com/x', fakeRequest(404, '93.184.216.34'))).ok, false);
  assert.strictEqual((await oneClickPost('https://u.example.com/x', fakeRequest(302, '93.184.216.34'))).ok, false);
  console.log('[5] 404·302 → 실패 (리다이렉트 안 따라감)');

  // 6) URL은 분석 결과(헤더)에서만: 등록 안 된 도메인·원클릭 미지원은 거절
  clear();
  assert.strictEqual((await unsubscribeOneClick('nowhere.example')).ok, false);
  register([{ domain: 'page.example', service: 'P', unsubscribe: 'https://page.example/u', unsubscribe_one_click: false }], 'mbox');
  assert.match((await unsubscribeOneClick('page.example')).error, /원클릭/);
  register([{ domain: 'one.example', service: 'O', unsubscribe: 'https://one.example/u', unsubscribe_one_click: true }], 'gmail');
  const r6 = await unsubscribeOneClick('one.example', fakeRequest(202, '93.184.216.34'));
  assert.ok(r6.ok);
  clear('gmail');
  assert.strictEqual(lookupEntry('one.example'), null, 'Gmail 연결 끊기 → 등록부에서도 삭제');
  console.log('[6] 등록 안 된 도메인·원클릭 미지원 거절, 등록된 원클릭은 성공(202), 연결 끊기면 삭제');

  // 7) 원클릭 판정은 헤더 기준: Post 헤더 + 헤더의 https 링크일 때만
  const mk = (from, extra) => `From: ${from}\r\nSubject: 소식\r\nDate: Mon, 2 Nov 2026 10:00:00 +0900\r\n${extra}\r\n\r\n본문 수신거부: https://body.example/u`;
  const mails = await parseRawMessages([
    mk('A <a@a-one.example>', 'List-Unsubscribe: <https://a-one.example/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'),
    mk('B <b@b-http.example>', 'List-Unsubscribe: <http://b-http.example/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'),
    mk('C <c@c-mail.example>', 'List-Unsubscribe: <mailto:unsub@c-mail.example?subject=unsubscribe>'),
    mk('D <d@d-body.example>', 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'),
    mk('E <e@e-page.example>', 'List-Unsubscribe: <https://e-page.example/u>'),
  ]);
  const g = Object.fromEntries(groupByDomain(mails).map((x) => [x.domain, x]));
  assert.strictEqual(g['a-one.example'].unsubscribe_one_click, true);
  assert.strictEqual(g['b-http.example'].unsubscribe_one_click, false, 'http는 원클릭 아님');
  assert.strictEqual(g['c-mail.example'].unsubscribe, 'mailto:unsub@c-mail.example?subject=unsubscribe');
  assert.strictEqual(g['d-body.example'].unsubscribe_one_click, false, '본문 링크는 원클릭 아님');
  assert.strictEqual(g['e-page.example'].unsubscribe_one_click, false);
  console.log('[7] 원클릭 = Post 헤더 + 헤더 https 링크일 때만 (http·본문 링크·mailto 제외)');

  console.log('\n✅ 수신거부 검증 통과');
})().catch((e) => { console.error('❌', e); process.exit(1); });
