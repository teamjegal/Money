// [Gmail로 분석하기]: 연결 상태, 분석 시작, 진행률 폴링, 연결 끊기
(() => {
  const $ = (id) => document.getElementById(id);
  const app = window.CCApp;
  const PHASE = {
    starting: '분석 준비 중…',
    listing: '메일 목록 가져오는 중…',
    retrying: '읽지 못한 메일 다시 시도 중…',
    grouping: '서비스별로 묶는 중…',
    classifying: '위험도 판단 중…',
  };
  let status = { configured: false, connected: false };
  let polling = false;

  async function api(path, method = 'GET') {
    const res = await fetch(path, { method });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function renderState() {
    const st = $('gmail-state');
    const btn = $('gmail-btn');
    st.classList.toggle('on', status.connected);
    if (!status.configured) {
      st.textContent = '서버에 Google 연결 설정이 없어요 (.env의 GOOGLE_CLIENT_ID). 아래 다른 방법을 써 주세요.';
      btn.disabled = true;
      $('other').open = true;
    } else if (status.connected) {
      st.textContent = `● 연결됨: ${status.email || 'Gmail'} (읽기 전용)`;
      btn.disabled = polling;
    } else {
      st.textContent = '구글 로그인 화면에서 직접 로그인해요. 읽기 권한만 요청합니다.';
      btn.disabled = false;
    }
    $('gmail-disconnect').hidden = !status.connected;
  }

  function renderProgress(job) {
    $('gmail-progress').hidden = false;
    let text, pct = 0;
    if (job.phase === 'fetching') {
      text = `메일 ${job.done.toLocaleString('ko-KR')}/${job.total.toLocaleString('ko-KR')} 확인 중`;
      pct = job.total ? (job.done / job.total) * 90 : 0;
    } else {
      text = job.phase === 'listing' && job.total ? `메일 목록 가져오는 중… (${job.total.toLocaleString('ko-KR')}통)` : PHASE[job.phase] || '진행 중…';
      if (job.phase === 'retrying') text = `읽지 못한 메일 ${job.failed}통 다시 시도 중…`;
      pct = { starting: 0, listing: 2, retrying: 90, grouping: 92, classifying: 95, done: 100 }[job.phase] ?? 0;
    }
    $('gp-text').textContent = text;
    $('gp-pct').textContent = `${Math.round(pct)}%`;
    $('gp-fill').style.width = `${pct}%`;
  }

  async function poll() {
    polling = true;
    renderState();
    app.setBusy(true);
    try {
      for (;;) {
        const { ok, data } = await api('/api/analyze-gmail/progress');
        if (!ok) throw new Error(data.error || '진행 상황을 확인하지 못했어요.');
        const job = data.job;
        renderProgress(job);
        if (job.phase === 'done') {
          $('gp-text').textContent = `메일 ${job.mailCount.toLocaleString('ko-KR')}통 분석 완료${job.failed ? ` (읽기 실패 ${job.failed}통)` : ''}`;
          app.applyResult(job.items, job.mode, '광고·가입 메일을 보낸 서비스를 찾지 못했어요.');
          break;
        }
        if (job.phase === 'error') throw new Error(job.error);
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      app.setStatus(e.message, 'error');
      $('gmail-progress').hidden = true;
      await refreshStatus();
    } finally {
      polling = false;
      app.setBusy(false);
      renderState();
    }
  }

  async function start() {
    if (!status.connected) { location.href = '/auth/google'; return; }
    app.setStatus('');
    const { ok, status: code, data } = await api('/api/analyze-gmail', 'POST');
    if (code === 401) { status.connected = false; renderState(); location.href = '/auth/google'; return; }
    if (!ok && code !== 409) return app.setStatus(data.error || 'Gmail 분석을 시작하지 못했어요.', 'error');
    poll(); // 409(이미 분석 중)면 그 작업을 이어서 보여준다
  }

  async function refreshStatus() {
    const { ok, data } = await api('/api/gmail/status');
    if (ok) status = data;
    renderState();
    return data;
  }

  $('gmail-btn').addEventListener('click', start);
  $('gmail-disconnect').addEventListener('click', async () => {
    if (!confirm('Gmail 연결을 끊을까요?\n서버 메모리의 연결 정보와 분석 결과, 이 화면의 체크 상태가 모두 지워져요.')) return;
    await api('/api/gmail/disconnect', 'POST');
    app.clearResult();
    $('gmail-progress').hidden = true;
    app.setStatus('Gmail 연결을 끊고 분석 결과를 지웠어요.');
    await refreshStatus();
  });

  // 시작: 상태 확인 → 로그인 직후면 바로 분석, 분석 중이던 작업이 있으면 이어서 표시
  (async () => {
    const params = new URLSearchParams(location.search);
    const flag = params.get('gmail');
    if (flag) history.replaceState(null, '', location.pathname); // 주소창 정리
    const data = await refreshStatus();
    const msg = {
      denied: '구글 로그인에서 권한을 허용하지 않았어요.',
      bad_state: '로그인 확인값이 맞지 않아요. 다시 시도해 주세요.',
      error: 'Gmail 연결 중 오류가 났어요. 다시 시도해 주세요.',
      not_configured: '서버에 Google 연결 설정이 없어요.',
    }[flag];
    if (msg) app.setStatus(msg, 'error');
    if (flag === 'connected' && status.connected) start();
    else if (data && data.job && !['done', 'error'].includes(data.job.phase)) poll();
  })();
})();
