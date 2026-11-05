// 확장 공통 기능 (background.js 에서 importScripts 로 불러옴)
// 탭 로딩 대기 · 페이지 스캔 · 안전 필터 · 서버에 해제 대상 요청 · 강조·승인 배너 · 결과 검증 · 웹에 알리기

const WEB_ORIGIN = 'http://localhost:3000';
const API_BASE = 'http://localhost:3000'; // API 키는 서버(.env)에만 있다
const TAB_LOAD_TIMEOUT = 15000;
const LOGIN_TIMEOUT = 120000; // 사용자가 직접 로그인할 시간
const NOT_FOUND = '이 페이지에서 광고 수신 항목을 찾지 못했어요. 알림/마케팅 설정 페이지인지 확인해주세요.';

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
    if (!onlyNext) {
      chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { cleanup(); resolve(); } }).catch(() => {});
    }
  });
}

async function scanTab(tabId) {
  // 맨 위 프레임만 (iframe 안은 스캔하지 않음)
  const [res] = await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ['scan.js'] });
  return res && res.result ? res.result : { status: 'error', error: '페이지를 읽지 못했어요.' };
}

// 로그인 페이지면 사용자가 로그인할 때까지 기다렸다가 다시 스캔
async function scanUntilLoggedIn(tabId) {
  const deadline = Date.now() + LOGIN_TIMEOUT;
  let scan = await scanTab(tabId);
  const stop = scan.status === 'need_login' ? keepAlive() : () => {}; // 로그인 기다리는 동안 서비스 워커 유지
  try {
  while (scan.status === 'need_login') {
    const left = deadline - Date.now();
    if (left <= 0) return scan;
    console.log('[cc] 로그인 페이지 감지 → 사용자가 로그인할 때까지 대기');
    try {
      await waitForTabComplete(tabId, { timeout: left, onlyNext: true });
    } catch (e) {
      if (/초과/.test(e.message)) return scan;
      throw e;
    }
    scan = await scanTab(tabId);
  }
  } finally { stop(); }
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

// 긴 라벨에서 설명을 떼고 이름만: "이메일 광고 수신 동의 할인 쿠폰…" → "이메일 광고 수신"
function shortLabel(label) {
  const m = label.match(/^.{2,40}?(동의|알림|수신)(?=\s|$)/);
  return (m ? m[0] : label.slice(0, 24)).trim();
}

// 스캔 결과 → 안전 필터 → 서버 → 응답 재검증 → 승인 배너에 넘길 계획
async function buildPlan(scan) {
  const removed = scan.controls.filter(isDangerous);
  const controls = scan.controls.filter((c) => !isDangerous(c));
  console.log('[cc] 스캔', scan.controls.length, '개 / 안전 필터로 제외', removed.map((c) => c.label));
  const { data, mode } = await pickTargets(scan.url, controls.map(({ via, href, ...c }) => c));
  // 서버 응답도 믿지 않고 다시 확인: 우리가 보낸 안전한 목록 안의 id만
  const allowed = new Map(controls.map((c) => [c.id, c]));
  const targets = (data.targets || []).filter((t) => allowed.has(t.id) && !allowed.get(t.id).disabled);
  const saveId = allowed.has(data.save_id) ? data.save_id : null;
  const plan = {
    url: scan.url,
    mode,
    targets: targets.map((t) => {
      const c = allowed.get(t.id);
      return { id: t.id, reason: t.reason, label: c.label, short: shortLabel(c.label), kind: c.kind };
    }),
    save_id: saveId,
    save_label: saveId ? allowed.get(saveId).label : null,
    removed: removed.map((c) => c.label),
    scanned: scan.controls.length,
  };
  console.log('[cc] 해제 대상', plan);
  return plan;
}

// 서비스 워커가 사용자 승인을 기다리는 동안 잠들지 않게 (MV3는 30초 쉬면 종료)
function keepAlive() {
  const t = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  return () => clearInterval(t);
}

async function runOverlay(tabId, plan) {
  const stop = keepAlive();
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (p) => window.__ccOverlay.show(p),
      args: [plan],
    });
    return res && res.result ? res.result : { status: 'error', error: '승인 배너 결과를 받지 못했어요.' };
  } catch (e) {
    // 저장하면서 페이지가 새로 로드되면 스크립트가 끊긴다 → 다시 읽어서 라벨로 확인
    console.warn('[cc] 오버레이 중단, 다시 읽어서 확인:', e.message);
    return verifyAfterReload(tabId, plan);
  } finally {
    stop();
  }
}

async function verifyAfterReload(tabId, plan) {
  try {
    await waitForTabComplete(tabId);
    const scan = await scanTab(tabId);
    if (scan.status !== 'ok') throw new Error('다시 읽기 실패');
    const changed = [], failed = [];
    for (const t of plan.targets) {
      const c = scan.controls.find((x) => x.label === t.label && x.kind === t.kind);
      const off = c && (t.kind === 'radio' ? c.checked === true : c.checked === false);
      (off ? changed : failed).push(t.short);
    }
    return { status: 'done', changed, failed, saved: true, reloaded: true };
  } catch (e) {
    return { status: 'error', error: `해제 결과를 확인하지 못했어요: ${e.message}` };
  }
}

// 페이지에 짧은 안내 배너 (대상을 못 찾았을 때 등)
async function showNotice(tabId, text, ms) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, func: (t, m) => window.__ccOverlay.notice(t, m), args: [text, ms || 10000] });
  } catch (e) {
    console.warn('[cc] 안내 배너 표시 실패:', e.message);
  }
}

// 열려 있는 동의 클리너 체크리스트 탭들에 결과 알리기 (도메인으로 해당 서비스에 ✅)
async function notifyWeb(message) {
  try {
    const tabs = await chrome.tabs.query({ url: `${WEB_ORIGIN}/*` });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, message).catch(() => {});
  } catch (e) {
    console.warn('[cc] 웹 알림 실패:', e.message);
  }
}
