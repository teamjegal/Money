// 실제 수신거부 처리 (RFC 8058 원클릭: List-Unsubscribe-Post)
// - URL은 클라이언트가 보내지 않는다. 서버 메모리에 있는 "분석 결과(메일 헤더)"에서만 꺼낸다.
// - https만, localhost·사설·예약 IP는 차단 (DNS로 풀린 실제 주소까지 검사, 리다이렉트 안 따라감)
const https = require('https');
const dns = require('dns');
const net = require('net');

// ---- 메모리 등록부: 서비스 도메인 → 메일 헤더의 수신거부 정보 (원칙 8: 메모리에만) ----
const registry = new Map();

function register(items, source) {
  for (const x of items || []) {
    if (!x || !x.domain || !x.unsubscribe) continue;
    registry.set(x.domain, { url: x.unsubscribe, oneClick: !!x.unsubscribe_one_click, service: x.service, source });
  }
}
function clear(source) {
  for (const [k, v] of registry) if (!source || v.source === source) registry.delete(k);
}
const lookupEntry = (domain) => registry.get(domain) || null;

// ---- 주소 검사 ----
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 // 0/8, 사설 10/8, 루프백, 멀티캐스트·예약
      || (a === 100 && b >= 64 && b <= 127) // CGNAT
      || (a === 169 && b === 254) // 링크 로컬 (클라우드 메타데이터 포함)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) // 사설
      || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)); // 예약·벤치마크
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isBlockedIp(v.slice(7)); // IPv4 매핑
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  return true;
}

function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('수신거부 주소가 올바르지 않아요.'); }
  if (u.protocol !== 'https:') throw new Error('https 주소만 처리할 수 있어요.');
  if (u.username || u.password) throw new Error('주소 형식이 허용되지 않아요.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('내부 주소로는 요청할 수 없어요.');
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new Error('내부·사설 IP 주소로는 요청할 수 없어요.');
  if (u.port && u.port !== '443') throw new Error('기본 https 포트(443)만 허용해요.');
  return u;
}

// DNS 결과도 검사하는 lookup (연결 직전에 실행 → DNS 리바인딩 방지)
function safeLookup(baseLookup = dns.lookup) {
  return (hostname, options, cb) => {
    baseLookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIPv6(addrs) ? 6 : 4 }];
      const bad = list.find((a) => isBlockedIp(a.address));
      if (bad || !list.length) return cb(Object.assign(new Error('내부·사설 IP로 연결되는 주소예요.'), { code: 'EBLOCKED' }));
      if (options && options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

// RFC 8058: POST, body "List-Unsubscribe=One-Click", 리다이렉트 따라가지 않음
function oneClickPost(rawUrl, { lookup, timeoutMs = 10000, request = https.request } = {}) {
  const u = checkUrl(rawUrl);
  const body = 'List-Unsubscribe=One-Click';
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: 'https:', hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
      lookup: safeLookup(lookup),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'ConsentCleaner/0.1 (RFC 8058 one-click unsubscribe)',
      },
      timeout: timeoutMs,
    }, (res) => {
      res.resume(); // 본문은 읽지 않음
      resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300 });
    });
    req.on('timeout', () => req.destroy(new Error('수신거부 서버 응답이 없어요 (시간 초과).')));
    req.on('error', (e) => reject(e.code === 'EBLOCKED' ? e
      : e.code === 'ENOTFOUND' ? new Error('수신거부 서버 주소를 찾을 수 없어요.') : e));
    req.end(body);
  });
}

// 진입점: 도메인으로 등록부에서 꺼내 원클릭 실행
async function unsubscribeOneClick(domain, opts) {
  const entry = lookupEntry(domain);
  if (!entry) return { ok: false, error: '분석 결과에 이 서비스의 수신거부 정보가 없어요. 다시 분석해 주세요.' };
  if (!entry.oneClick) return { ok: false, error: '이 서비스는 원클릭 수신거부를 지원하지 않아요.' };
  try {
    const r = await oneClickPost(entry.url, opts);
    if (r.ok) return { ok: true, status: r.status, service: entry.service };
    return { ok: false, status: r.status, error: `수신거부 서버가 거절했어요 (HTTP ${r.status}). 수신거부 페이지에서 직접 해 주세요.` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { register, clear, lookupEntry, unsubscribeOneClick, oneClickPost, checkUrl, isBlockedIp, safeLookup };
