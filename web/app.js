// 동의 클리너 — 체크리스트 화면
(() => {
  const $ = (id) => document.getElementById(id);
  const RISK_LABEL = { high: '위험 높음', medium: '보통', low: '낮음' };
  const MODE_LABEL = {
    llm: 'AI가 판단했어요',
    rules: '규칙 기반으로 판단했어요 (AI 키 없음)',
    'rules-fallback': 'AI 연결이 안 돼 규칙 기반으로 판단했어요',
    mixed: '일부는 규칙 기반으로 판단했어요',
  };
  const KEY_DONE = 'cc.done.v1';
  const KEY_RESULT = 'cc.result.v1';

  // ---- localStorage (막혀 있어도 화면은 동작하게) ----
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가: 무시 */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* 무시 */ }
    },
  };

  let items = [];
  let mode = '';
  let done = store.get(KEY_DONE, {}); // { domain: true }
  let pickedFile = null;

  // 메일에서 온 글자는 항상 이스케이프
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 입력 ----
  const drop = $('drop');
  function setFile(file) {
    pickedFile = file || null;
    drop.classList.toggle('has-file', !!file);
    $('file-label').innerHTML = file
      ? `<b>${esc(file.name)}</b><br>${(file.size / 1024).toFixed(0)} KB · 다른 파일 선택`
      : '<b>.mbox 파일 선택</b><br>또는 여기로 끌어다 놓기';
  }
  $('file').addEventListener('change', (e) => setFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

  function setStatus(text, kind) {
    const el = $('status');
    el.className = 'status' + (kind === 'error' ? ' error' : '');
    el.innerHTML = kind === 'loading' ? `<span class="spinner" aria-hidden="true"></span>${esc(text)}` : esc(text);
  }

  function setBusy(busy) {
    $('analyze').disabled = busy;
    $('sample').disabled = busy;
  }

  async function analyze(text) {
    if (!text.trim()) return setStatus('파일을 선택하거나 메일을 붙여넣어 주세요.', 'error');
    setBusy(true);
    setStatus('메일을 분석하는 중이에요…', 'loading');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석에 실패했어요.');
      applyResult(data, res.headers.get('X-Analysis-Mode') || '');
    } catch (e) {
      setStatus(e.message === 'Failed to fetch' ? '서버에 연결할 수 없어요. npm start 상태를 확인해 주세요.' : e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // 분석 결과 반영 (.mbox·Gmail 공용)
  function applyResult(list, how, emptyMsg = '가입처를 찾지 못했어요. 메일 형식을 확인해 주세요.') {
    items = list;
    mode = how;
    store.set(KEY_RESULT, { items, mode, at: Date.now() });
    setStatus(items.length ? `${items.length}곳을 찾았어요.` : emptyMsg);
    render();
    if (items.length) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 결과·체크 상태 모두 지우기 (Gmail 연결 끊기)
  function clearResult() {
    items = []; done = {};
    store.remove(KEY_RESULT); store.remove(KEY_DONE);
    render();
  }

  $('analyze').addEventListener('click', async () => {
    const text = pickedFile ? await pickedFile.text() : $('paste').value;
    analyze(text);
  });

  $('sample').addEventListener('click', async () => {
    try {
      const res = await fetch('/samples/demo.mbox');
      if (!res.ok) throw new Error();
      analyze(await res.text());
    } catch {
      setStatus('샘플 파일을 불러오지 못했어요.', 'error');
    }
  });

  $('reset').addEventListener('click', () => {
    if (!confirm('분석 결과와 체크 상태를 모두 지울까요?')) return;
    items = []; done = {};
    store.remove(KEY_RESULT); store.remove(KEY_DONE);
    setStatus('');
    render();
  });

  // ---- 화면 그리기 ----
  function render() {
    $('result').hidden = items.length === 0;
    if (!items.length) return;

    $('s-total').textContent = items.length;
    $('s-ads').textContent = items.filter((x) => x.marketing_consent).length;
    $('s-high').textContent = items.filter((x) => x.risk === 'high').length;
    $('mode').textContent = MODE_LABEL[mode] || '';

    const list = $('list');
    const openSet = new Set([...list.querySelectorAll('.item.open')].map((el) => el.dataset.domain));
    list.innerHTML = items.map((x) => rowHtml(x, openSet.has(x.domain))).join('');
    renderProgress();
  }

  function rowHtml(x, open) {
    const isDone = !!done[x.domain];
    const buttons = [
      x.settings_url ? `<button class="btn sm ai" data-act="ai">AI로 해제</button>` : '',
      x.unsubscribe ? `<button class="btn sm" data-act="unsub">수신거부</button>` : '',
      `<button class="btn sm" data-act="delete">삭제 요청 메일</button>`,
    ].join('');
    const signals = (x.signals || []).map((s) => `<li>${esc(s)}</li>`).join('') || '<li>특별한 신호 없음</li>';
    const by = x.judged_by === 'llm' ? 'AI 판단' : '규칙 판단';
    return `
      <li class="item${isDone ? ' done' : ''}${open ? ' open' : ''}" data-domain="${esc(x.domain)}">
        <div class="row" data-act="toggle">
          <input type="checkbox" class="check" data-act="check" ${isDone ? 'checked' : ''} aria-label="${esc(x.service)} 처리 완료">
          <div class="main">
            <div class="title-line">
              <span class="name">${esc(x.service)}</span>
              <span class="badge ${esc(x.risk)}">${RISK_LABEL[x.risk] || esc(x.risk)}</span>
              ${isDone ? '<span class="done-tag">✓ 완료</span>' : ''}
            </div>
            <div class="meta">${esc(x.category)} · 마지막 메일 ${esc(x.last_seen || '-')}</div>
          </div>
          <div class="buttons">${buttons}</div>
          <button class="chev" data-act="toggle" aria-label="자세히 보기" aria-expanded="${open}">▾</button>
        </div>
        <div class="detail">
          <h3>판단 근거</h3>
          <div class="reason"><span class="by">${by}</span>${esc(x.reason)}</div>
          <h3>메일에서 찾은 신호</h3>
          <ul class="signals">${signals}</ul>
          <div class="facts">${esc(x.domain)} · 메일 ${esc(x.mail_count ?? '-')}통 · ${esc(x.first_seen || '-')} ~ ${esc(x.last_seen || '-')}</div>
        </div>
      </li>`;
  }

  function renderProgress() {
    const total = items.length;
    const n = items.filter((x) => done[x.domain]).length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    $('p-done').textContent = n;
    $('p-total').textContent = total;
    $('fill').style.width = pct + '%';
    $('bar').setAttribute('aria-valuenow', pct);
  }

  function setDone(domain, value) {
    if (value) done[domain] = true; else delete done[domain];
    store.set(KEY_DONE, done);
    render();
  }

  // ---- 행 이벤트 (위임) ----
  $('list').addEventListener('click', (e) => {
    const li = e.target.closest('.item');
    if (!li) return;
    const item = items.find((x) => x.domain === li.dataset.domain);
    const act = e.target.closest('[data-act]')?.dataset.act;

    if (act === 'check') return setDone(item.domain, e.target.checked);
    if (act === 'ai') return revokeWithExtension(item, e.target.closest('button'));
    if (act === 'unsub') return unsubscribe(item);
    if (act === 'delete') return alert('삭제 요청 메일 기능은 준비 중이에요.');
    if (act === 'toggle') {
      const open = li.classList.toggle('open');
      li.querySelector('.chev').setAttribute('aria-expanded', open);
    }
  });

  function unsubscribe(item) {
    const url = item.unsubscribe;
    if (!/^(https?:|mailto:)/i.test(url)) return alert('수신거부 링크가 올바르지 않아요.');
    window.open(url, '_blank', 'noopener');
    // 새 탭에서 돌아온 뒤 물어보기
    setTimeout(() => {
      if (confirm(`${item.service} 수신거부를 마쳤나요?\n확인을 누르면 처리 완료로 표시해요.`)) setDone(item.domain, true);
    }, 300);
  }

  // 확장 연동(revoke.js)에서 쓰는 함수들
  window.CCApp = { setDone, setStatus, esc, applyResult, clearResult, setBusy };
  const revokeWithExtension = (item, btn) => window.CCRevoke.run(item, btn);

  // ---- 시작: 지난 결과 복원 ----
  const saved = store.get(KEY_RESULT, null);
  if (saved && Array.isArray(saved.items)) {
    items = saved.items;
    mode = saved.mode || '';
    render();
  }
})();
