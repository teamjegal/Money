// 확장 아이콘 팝업: 지금 보고 있는 탭에서 광고 동의 찾기
(async () => {
  const $ = (id) => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url ? tab.url : '';
  $('site').textContent = url ? new URL(url).hostname : '';

  // 체크리스트의 [AI로 해제]로 연 탭이면 어떤 서비스인지 안내
  const key = `guide:${tab.id}`;
  const ctx = (await chrome.storage.session.get(key))[key];
  if (ctx) {
    $('guide').hidden = false;
    $('guide').textContent = `${ctx.service}: 로그인 후 마이페이지 > 알림(수신) 설정으로 이동한 다음 아래 버튼을 눌러주세요.`;
  }

  const show = (text, kind = '') => { $('msg').className = `msg ${kind}`; $('msg').textContent = text; };
  if (!/^https?:\/\//.test(url)) {
    $('scan').disabled = true;
    show('일반 웹페이지에서만 사용할 수 있어요.', 'warn');
  }

  $('scan').addEventListener('click', () => {
    $('scan').disabled = true;
    show('페이지를 읽고 광고 동의 항목을 찾는 중…');
    chrome.runtime.sendMessage({ type: 'SCAN_ACTIVE', tabId: tab.id }, (r) => {
      $('scan').disabled = false;
      if (chrome.runtime.lastError || !r) return show('확장 프로그램 오류가 났어요. 다시 눌러주세요.', 'warn');
      if (r.status === 'banner') {
        show(`${r.count}개 항목을 찾았어요. 페이지의 노란 배너에서 [승인]을 눌러주세요.`, 'ok');
        setTimeout(() => window.close(), 1800); // 페이지의 배너를 누를 수 있게 팝업 닫기
      } else {
        show(r.message || r.error || '알 수 없는 오류', r.status === 'none' || r.status === 'need_login' ? '' : 'warn');
      }
    });
  });
})();
