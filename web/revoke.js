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
    // 설정 페이지를 알면(데모쇼핑 settings_url, 실제 서비스 settings_page) 자동 진행, 모르면 홈페이지 안내
    const settingsUrl = item.settings_url || item.settings_page;
    if (!settingsUrl) return guide(item);
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '설정 페이지에서 진행 중…';
    setStatus(`${item.service} 설정 페이지를 새 탭에서 열었어요. 로그인 화면이 뜨면 직접 로그인하고, 노란 배너에서 승인해 주세요.`, 'loading');
    toast(`<b>${esc(item.service)}</b> 설정 페이지를 새 탭에서 열었어요.<br>로그인 후 노란 배너에서 [승인]을 눌러 주세요.`, 'info', 6000);

    // 로그인(최대 2분) + 승인(최대 3분)까지 기다린다
    const result = await CCExt.request('REVOKE', {
      service: item.service, domain: item.domain, settings_url: settingsUrl,
    }, 6 * 60 * 1000);
    btn.disabled = false;
    btn.textContent = label;
    console.log('[동의 클리너] REVOKE 결과', result);

    if (result.status === 'done') {
      const changed = result.changed || [], failed = result.failed || [];
      if (!failed.length) {
        setDone(item.domain, true);
        const msg = changed.length ? `${summary(changed)} 해제` : (result.note || '이미 모두 꺼져 있어요');
        setStatus(`${item.service}: ${msg}`);
        toast(`<b>${esc(item.service)}</b> · ${esc(msg)}`, 'ok', 6000);
      } else {
        const msg = `${changed.length}개 해제, ${failed.length}개는 직접 꺼주세요 (${failed.join(', ')})`;
        setStatus(`${item.service}: ${msg}`, 'error');
        toast(`<b>${esc(item.service)}</b> · ${esc(msg)}<br>설정 탭에서 빨간 표시 항목을 꺼 주세요.`, 'warn', 9000);
      }
    } else if (result.status === 'need_login') {
      setStatus('로그인 후 다시 눌러주세요.', 'error');
      toast('로그인 후 다시 [AI로 해제]를 눌러주세요.', 'warn');
    } else if (result.status === 'cancelled') {
      setStatus(result.reason === 'timeout' ? '응답이 없어 해제를 취소했어요.' : '해제를 취소했어요. 아무것도 바뀌지 않았어요.');
      toast('해제를 취소했어요. 아무것도 바뀌지 않았어요.', 'info');
    } else {
      setStatus(`AI 해제 실패: ${result.error || '알 수 없는 오류'}`, 'error');
      toast(`AI 해제 실패: ${esc(result.error || '알 수 없는 오류')}`, 'warn');
    }
  }

  // 설정 페이지 주소를 모르는 실제 서비스: 홈페이지를 열고 그 페이지 위에 안내 배너 (해제는 그 사이트에서 팝업으로)
  const GUIDE_TEXT = '로그인 후 마이페이지 > 알림 설정으로 이동한 다음, 확장 아이콘의 \'이 페이지에서 광고 동의 찾기\'를 눌러주세요';
  async function guide(item) {
    const { setStatus } = window.CCApp;
    const url = item.homepage || `https://${item.domain}/`; // 메일 전용 도메인 대신 본 사이트
    setStatus(`${item.service}: ${GUIDE_TEXT}`);
    toast(`<b>${esc(item.service)}</b> 홈페이지를 새 탭으로 열어요.<br>${esc(GUIDE_TEXT)}<br><small>처리 결과는 이 체크리스트에 자동으로 표시돼요.</small>`, 'info', 12000);
    const r = await CCExt.request('GUIDE', { service: item.service, domain: item.domain, url }, 20000);
    if (r.status !== 'guided') setStatus(`홈페이지를 열지 못했어요: ${r.error || '알 수 없는 오류'}`, 'error');
  }

  // 팝업으로 다른 사이트에서 해제한 결과 → 도메인이 맞는 서비스에 ✅
  // (www.coupang.com → coupang.com, 합쳐진 서비스는 domains 중 하나라도 맞으면)
  const hostMatches = (host, d) => host === d || host.endsWith(`.${d}`);
  CCExt.onRevoked(({ host, result }) => {
    const { setDone, setStatus, getItems } = window.CCApp;
    host = String(host || '').toLowerCase();
    const item = getItems().find((x) => x.kind !== 'institution' && (x.domains || [x.domain]).some((d) => hostMatches(host, d)));
    const changed = result.changed || [], failed = result.failed || [];
    const name = item ? item.service : host;
    if (!failed.length && changed.length) {
      if (item) setDone(item.domain, true);
      setStatus(`${name}: ${summary(changed)} 해제`);
      toast(`<b>${esc(name)}</b> · ${esc(summary(changed))} 해제${item ? '' : '<br><small>체크리스트에 이 사이트와 맞는 서비스가 없어 표시만 했어요.</small>'}`, 'ok', 7000);
    } else if (failed.length) {
      setStatus(`${name}: ${changed.length}개 해제, ${failed.length}개는 직접 꺼주세요`, 'error');
      toast(`<b>${esc(name)}</b> · ${failed.length}개는 직접 꺼주세요 (${esc(failed.join(', '))})`, 'warn', 9000);
    }
  });

  return { run, toast };
})();
