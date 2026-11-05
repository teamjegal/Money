// 웹페이지(동의 클리너 체크리스트) <-> 확장 background 메시지 중계 (content script)
(() => {
  const post = (msg) => window.postMessage({ source: 'cc-ext', ...msg }, location.origin);

  window.addEventListener('message', (event) => {
    // 같은 창, 같은 출처에서 온 cc-web 메시지만 받는다
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'cc-web' || typeof data.type !== 'string') return;

    // 웹이 늦게 로드돼 READY를 놓친 경우를 위한 확인
    if (data.type === 'PING') return post({ type: 'READY' });

    const { requestId, type, payload } = data;
    try {
      chrome.runtime.sendMessage({ type, payload }, (result) => {
        const err = chrome.runtime.lastError;
        post({ requestId, result: err ? { status: 'error', error: err.message } : result });
      });
    } catch (e) {
      // 확장을 다시 로드하면 기존 탭의 content script 연결이 끊긴다
      post({ requestId, result: { status: 'error', error: '확장 프로그램이 다시 로드됐어요. 페이지를 새로고침해 주세요.' } });
    }
  });

  post({ type: 'READY' });
})();
