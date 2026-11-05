// 확장 background (service worker)
// REVOKE: 설정 페이지 열기 → (로그인 대기) → 페이지 스캔 → 안전 필터 → 서버에 해제 대상 요청.
// 아직 클릭은 하지 않는다. 고른 결과만 console.log 하고 응답으로 돌려준다.

const WEB_ORIGIN = 'http://localhost:3000';
const API_BASE = 'http://localhost:3000'; // API 키는 서버(.env)에만 있다
const TAB_LOAD_TIMEOUT = 15000;
const LOGIN_TIMEOUT = 120000; // 사용자가 직접 로그인할 시간

// 위험 요소: LLM 판단과 무관하게 코드에서 후보 제외 (서버도 한 번 더 거른다)
const DANGER = /탈퇴|삭제|해지|결제|구매|비밀번호|로그아웃|withdraw|unregister|delete|remove.?account|log.?out|sign.?out|payment|purchase|password/i;
const isDangerous = (c) => DANGER.test(`${c.label || ''} ${c.href || ''}`);

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// 탭 로딩 완료 기다리기. onlyNext=true면 지금 상태와 상관없이 "다음" 로딩 완료를 기다린다.
function waitForTabComplete(tabId, { timeout = TAB_LOAD_TIMEOUT, onlyNext = false } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('페이지 로딩 시간이 초과됐어요.')); }, timeout);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') { cleanup(); resolve(); }
    }
    function onRemoved(id) {
      if (id === tabId) { cleanup(); reject(new Error('설정 페이지 탭이 닫혔어요.')); }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    // 리스너 등록 전에 이미 로딩이 끝났을 수도 있어서 한 번 확인
    if (!onlyNext) {
      chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { cleanup(); resolve(); } }).catch(() => {});
    }
  });
}

async function scanTab(tabId) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ['scan.js'] });
  return res && res.result ? res.result : { status: 'error', error: '페이지를 읽지 못했어요.' };
}

// 로그인 페이지면 사용자가 로그인할 때까지 기다렸다가 다시 스캔
async function scanUntilLoggedIn(tabId) {
  const deadline = Date.now() + LOGIN_TIMEOUT;
  let scan = await scanTab(tabId);
  while (scan.status === 'need_login') {
    const left = deadline - Date.now();
    if (left <= 0) return scan;
    console.log('[cc] 로그인 페이지 감지 → 사용자가 로그인할 때까지 대기');
    try {
      await waitForTabComplete(tabId, { timeout: left, onlyNext: true });
    } catch (e) {
      if (/초과/.test(e.message)) return scan; // 시간 안에 로그인 안 함
      throw e;
    }
    scan = await scanTab(tabId);
  }
  return scan;
}

async function pickTargets(url, controls) {
  const res = await fetch(`${API_BASE}/api/pick-targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, controls }),
  });
  if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
  return { data: await res.json(), mode: res.headers.get('X-Pick-Mode') };
}

async function handleRevoke(payload) {
  const url = payload && payload.settings_url;
  if (!isSafeUrl(url)) return { status: 'error', error: '설정 페이지 주소가 올바르지 않아요.' };

  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);

  const scan = await scanUntilLoggedIn(tab.id);
  if (scan.status === 'need_login') return { status: 'need_login', tabId: tab.id, error: '로그인이 필요해요. 열린 탭에서 로그인한 뒤 다시 시도해 주세요.' };
  if (scan.status !== 'ok') return { status: 'error', tabId: tab.id, error: scan.error || '페이지를 읽지 못했어요.' };

  // 안전 필터 (LLM 전에, 코드로)
  const removed = scan.controls.filter(isDangerous);
  const controls = scan.controls.filter((c) => !isDangerous(c));
  console.log('[cc] 스캔', scan.controls.length, '개 / 안전 필터로 제외', removed.map((c) => c.label));

  const { data, mode } = await pickTargets(scan.url, controls.map(({ via, href, ...c }) => c));
  // 서버 응답도 믿지 않고 다시 확인: 우리가 보낸 안전한 목록 안의 id만
  const allowed = new Map(controls.map((c) => [c.id, c]));
  const targets = (data.targets || []).filter((t) => allowed.has(t.id) && !allowed.get(t.id).disabled);
  const saveId = allowed.has(data.save_id) ? data.save_id : null;

  const result = {
    status: 'picked',
    tabId: tab.id,
    url: scan.url,
    mode,
    targets: targets.map((t) => ({ ...t, label: allowed.get(t.id).label })),
    save_id: saveId,
    save_label: saveId ? allowed.get(saveId).label : null,
    removed: removed.map((c) => c.label),
    scanned: scan.controls.length,
  };
  console.log('[cc] 해제 대상 (아직 클릭 안 함)', result);
  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 우리 웹페이지에서 온 메시지만 처리
  const from = sender.origin || (sender.url ? new URL(sender.url).origin : '');
  if (from !== WEB_ORIGIN) return false;

  if (msg && msg.type === 'REVOKE') {
    handleRevoke(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ status: 'error', error: e.message }));
    return true; // 비동기 응답
  }
  sendResponse({ status: 'error', error: `알 수 없는 요청: ${msg && msg.type}` });
  return false;
});
