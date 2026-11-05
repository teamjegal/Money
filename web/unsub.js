// 수신거부 버튼 3종: [바로 수신거부](RFC 8058 원클릭) / [수신거부 페이지 열기] / [수신거부 메일 쓰기]
// 원칙 10: 항목마다 사용자가 누르고 확인해야만 실행. 일괄 실행 없음.
window.CCUnsub = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function kindOf(x) {
    const url = x.unsubscribe || '';
    if (x.unsubscribe_one_click && /^https:\/\//i.test(url)) return 'oneclick';
    if (/^https?:\/\//i.test(url)) return 'page';
    if (/^mailto:/i.test(url)) return 'mail';
    return null;
  }
  const LABEL = { oneclick: '바로 수신거부', page: '수신거부 페이지 열기', mail: '수신거부 메일 쓰기' };
  const label = (x) => LABEL[kindOf(x)] || '';

  // 다른 탭·메일 앱에서 돌아오면 완료 여부를 물어본다
  function askWhenBack(item, question) {
    const ask = () => setTimeout(() => {
      if (confirm(`${question}\n확인을 누르면 체크리스트에 완료로 표시해요.`)) window.CCApp.setDone(item.domain, 'unsub');
    }, 400);
    window.addEventListener('focus', ask, { once: true });
  }

  async function oneClick(item, btn) {
    const toast = window.CCRevoke.toast;
    const text = btn.textContent;
    btn.disabled = true;
    btn.textContent = '수신거부 중…';
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: item.domain }),
      });
      const r = await res.json().catch(() => ({}));
      if (r.ok) {
        window.CCApp.setDone(item.domain, 'unsub');
        toast(`✅ <b>${esc(item.service)}</b> 수신거부 완료`, 'ok');
        return;
      }
      toast(`⚠ <b>${esc(item.service)}</b> 바로 수신거부 실패: ${esc(r.error || '알 수 없는 오류')}`, 'warn', 8000);
      // 원클릭이 안 되면 같은 링크를 페이지로 열어 직접 마무리할 수 있게
      if (confirm(`${item.service} 바로 수신거부에 실패했어요.\n(${r.error || '오류'})\n\n수신거부 페이지를 새 탭으로 열까요?`)) openPage(item);
    } catch {
      toast('서버에 연결할 수 없어요.', 'warn');
    } finally {
      btn.disabled = false;
      btn.textContent = text;
    }
  }

  function openPage(item) {
    window.open(item.unsubscribe, '_blank', 'noopener');
    window.CCRevoke.toast(`새 탭에서 <b>${esc(item.service)}</b> 수신거부 페이지가 열렸어요. 페이지에서 마무리해주세요.`, 'info', 7000);
    askWhenBack(item, `${item.service} 수신거부 페이지에서 마무리했나요?`);
  }

  function writeMail(item) {
    location.href = item.unsubscribe; // 메일 앱 열기 (mailto: 주소·제목은 메일 헤더 그대로)
    window.CCRevoke.toast(`메일 앱에서 <b>${esc(item.service)}</b> 수신거부 메일을 보내주세요.`, 'info', 7000);
    askWhenBack(item, `${item.service} 수신거부 메일을 보냈나요?`);
  }

  function run(item, btn) {
    const kind = kindOf(item);
    if (!kind) return alert('수신거부 링크가 올바르지 않아요.');
    if (!confirm(`${item.service} 광고 메일 수신을 거부할까요?`)) return;
    if (kind === 'oneclick') return oneClick(item, btn);
    if (kind === 'page') return openPage(item);
    return writeMail(item);
  }

  return { run, label, kindOf };
})();
