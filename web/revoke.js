// [AI로 해제]: 확장 프로그램 연결 상태 표시 + REVOKE 요청 + 결과 반영(✅·토스트)
window.CCRevoke = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 연결 상태 ----
  function renderExtStatus(state) {
    const pill = $('ext-status');
    pill.className = 'ext-pill ' + state;
    pill.textContent = { on: '확장 프로그램 연결됨', off: '확장 프로그램 미설치', checking: '확장 프로그램 확인 중…' }[state];
    $('ext-help').hidden = state !== 'off';
  }
  CCExt.onChange((on) => renderExtStatus(on ? 'on' : 'off'));
  setTimeout(() => { if (!CCExt.connected) renderExtStatus('off'); }, 1500); // READY 1.5초 안에 없으면 안내

  // ---- 토스트 ----
  let toastTimer = 0;
  function toast(html, kind = 'ok', ms = 5000) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = `toast ${kind} show`;
    el.innerHTML = html;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // 라벨 목록 → "이메일 광고 수신 등 5개"
  const summary = (labels) => (labels.length > 1 ? `${labels[0]} 등 ${labels.length}개` : labels[0] || '0개');

  // ---- 실행 ----
  async function run(item, btn) {
    const { setDone, setStatus } = window.CCApp;
    if (!CCExt.connected) {
      $('ext-help').hidden = false;
      $('ext-help').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '설정 페이지에서 진행 중…';
    setStatus(`${item.service} 설정 페이지를 새 탭에서 열었어요. 로그인 화면이 뜨면 직접 로그인하고, 노란 배너에서 승인해 주세요.`, 'loading');
    toast(`<b>${esc(item.service)}</b> 설정 페이지를 새 탭에서 열었어요.<br>로그인 후 노란 배너에서 [승인]을 눌러 주세요.`, 'info', 6000);

    // 로그인(최대 2분) + 승인(최대 3분)까지 기다린다
    const result = await CCExt.request('REVOKE', {
      service: item.service, domain: item.domain, settings_url: item.settings_url,
    }, 6 * 60 * 1000);
    btn.disabled = false;
    btn.textContent = label;
    console.log('[동의 클리너] REVOKE 결과', result);

    if (result.status === 'done') {
      const changed = result.changed || [], failed = result.failed || [];
      if (!failed.length) {
        setDone(item.domain, true);
        const msg = changed.length ? `${summary(changed)} 해제` : (result.note || '이미 모두 꺼져 있어요');
        setStatus(`✅ ${item.service}: ${msg}`);
        toast(`✅ <b>${esc(item.service)}</b> · ${esc(msg)}`, 'ok', 6000);
      } else {
        const msg = `${changed.length}개 해제, ${failed.length}개는 직접 꺼주세요 (${failed.join(', ')})`;
        setStatus(`⚠ ${item.service}: ${msg}`, 'error');
        toast(`⚠ <b>${esc(item.service)}</b> · ${esc(msg)}<br>설정 탭에서 빨간 표시 항목을 꺼 주세요.`, 'warn', 9000);
      }
    } else if (result.status === 'need_login') {
      setStatus('로그인 후 다시 눌러주세요.', 'error');
      toast('🔒 로그인 후 다시 [AI로 해제]를 눌러주세요.', 'warn');
    } else if (result.status === 'cancelled') {
      setStatus(result.reason === 'timeout' ? '응답이 없어 해제를 취소했어요.' : '해제를 취소했어요. 아무것도 바뀌지 않았어요.');
      toast('해제를 취소했어요. 아무것도 바뀌지 않았어요.', 'info');
    } else {
      setStatus(`AI 해제 실패: ${result.error || '알 수 없는 오류'}`, 'error');
      toast(`AI 해제 실패: ${esc(result.error || '알 수 없는 오류')}`, 'warn');
    }
  }

  return { run, toast };
})();
