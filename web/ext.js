// 크롬 확장 프로그램 연결 (bridge.js 와 window.postMessage 로 통신)
window.CCExt = (() => {
  let connected = false;
  let seq = 0;
  const pending = new Map(); // requestId -> { resolve, timer }
  const listeners = [];
  const revokedListeners = []; // 팝업으로 다른 사이트에서 해제한 결과

  const setConnected = (v) => {
    if (connected === v) return;
    connected = v;
    listeners.forEach((fn) => fn(v));
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'cc-ext') return;
    if (data.type === 'READY') return setConnected(true);
    if (data.type === 'REVOKED') return revokedListeners.forEach((fn) => fn(data));
    const p = pending.get(data.requestId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(data.requestId);
    p.resolve(data.result || { status: 'error', error: '빈 응답' });
  });

  // 확장이 먼저 READY를 보냈을 수 있으니 한 번 물어본다
  window.postMessage({ source: 'cc-web', type: 'PING' }, location.origin);

  return {
    get connected() { return connected; },
    onChange(fn) { listeners.push(fn); },
    onRevoked(fn) { revokedListeners.push(fn); },
    // 요청 보내고 결과 기다리기 (timeout 지나면 error 결과)
    request(type, payload, timeoutMs = 60000) {
      const requestId = `r${Date.now()}-${++seq}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          resolve({ status: 'error', error: '확장 프로그램 응답 시간이 초과됐어요.' });
        }, timeoutMs);
        pending.set(requestId, { resolve, timer });
        window.postMessage({ source: 'cc-web', requestId, type, payload }, location.origin);
      });
    },
  };
})();
