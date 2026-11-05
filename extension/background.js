// 확장 background (service worker)
// 웹 체크리스트에서 온 요청을 처리한다. 지금은 REVOKE → 설정 페이지 새 탭 열기까지.

const WEB_ORIGIN = 'http://localhost:3000';
const TAB_LOAD_TIMEOUT = 15000;

// 열어도 되는 주소인지: http(s)만 허용
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// 탭 로딩 완료까지 기다리기
function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('설정 페이지 로딩 시간이 초과됐어요.'));
    }, TAB_LOAD_TIMEOUT);

    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    // 리스너 등록 전에 이미 로딩이 끝났을 수도 있어서 한 번 확인
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }).catch(() => {});
  });
}

async function handleRevoke(payload) {
  const url = payload && payload.settings_url;
  if (!isSafeUrl(url)) return { status: 'error', error: '설정 페이지 주소가 올바르지 않아요.' };

  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);
  return { status: 'opened', tabId: tab.id, url };
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
