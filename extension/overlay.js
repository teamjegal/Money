// 강조 + 승인 배너 + 실행 (chrome.scripting 으로 설정 페이지에 주입)
// 사용자가 [승인]을 누르기 전에는 아무것도 클릭하지 않는다. (CLAUDE.md 핵심 원칙 2)
// window.__ccOverlay.show(plan) → Promise<{status, changed, failed, saved}>
(() => {
  if (window.__ccOverlay) return 'ready';

  const YELLOW = '#ffcc00';
  const APPROVE_TIMEOUT = 180000; // 3분 동안 응답 없으면 자동 취소
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 상태 읽기 ----
  const isOn = (el) => (el.matches('input[type=checkbox], input[type=radio]') ? el.checked : el.getAttribute('aria-checked') === 'true');
  const needsClick = (el, kind) => (kind === 'radio' ? !isOn(el) : isOn(el)); // 라디오는 "거부" 선택지를 눌러야 함
  const isRevoked = (el, kind) => (kind === 'radio' ? isOn(el) : !isOn(el));
  const rowOf = (el) => el.closest('label, li, tr, dl, .pref-row, [class*="row"], [class*="item"]') || el.parentElement;

  // ---- 강조 (원래 inline 스타일을 기억했다가 되돌림) ----
  const saved = new Map();
  function setStyle(el, styles) {
    if (!saved.has(el)) saved.set(el, el.getAttribute('style'));
    Object.assign(el.style, styles);
  }
  function restore(el) {
    if (!saved.has(el)) return;
    const s = saved.get(el);
    if (s === null) el.removeAttribute('style'); else el.setAttribute('style', s);
    saved.delete(el);
  }
  function highlight(el) {
    setStyle(el, { outline: `3px solid ${YELLOW}`, outlineOffset: '3px', boxShadow: `0 0 0 6px rgba(255, 204, 0, .35)` });
    const row = rowOf(el);
    if (row && row !== el) setStyle(row, { backgroundColor: '#fff8d6', transition: 'background-color .3s' });
  }
  const unhighlight = (el) => { restore(el); const row = rowOf(el); if (row) restore(row); };

  // ---- Shadow DOM 레이어 (배너 + 말풍선) ----
  let host = null, root = null, raf = 0;
  const bubbles = []; // { el, node }

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 24px));
      background: #fff; color: #1b2430; border: 2px solid ${YELLOW}; border-radius: 14px; padding: 16px 18px;
      box-shadow: 0 10px 40px rgba(0,0,0,.25); z-index: 2147483647; font-size: 14px; line-height: 1.5; pointer-events: auto; }
    .brand { font-size: 12px; font-weight: 700; color: #2156d9; margin-bottom: 4px; }
    .title { font-size: 16px; font-weight: 800; margin: 0 0 8px; }
    ul { margin: 0 0 10px; padding: 0; list-style: none; max-height: 30vh; overflow: auto; }
    li { padding: 5px 0; border-top: 1px solid #f0f0f0; display: flex; gap: 8px; align-items: baseline; }
    li:first-child { border-top: none; }
    li .r { color: #8a6d00; font-size: 12px; margin-left: auto; white-space: nowrap; }
    li.ok::before { content: "✓"; color: #1f8a4c; font-weight: 800; }
    li.fail::before { content: "!"; color: #d63a3a; font-weight: 800; }
    .note { font-size: 12px; color: #637083; margin-bottom: 12px; }
    .btns { display: flex; gap: 8px; justify-content: flex-end; }
    button { font: inherit; font-weight: 700; border-radius: 10px; padding: 9px 18px; cursor: pointer; border: 1px solid #d5dbe4; background: #fff; color: #1b2430; }
    button.ok { background: #2156d9; border-color: #2156d9; color: #fff; }
    button:disabled { opacity: .5; cursor: default; }
    .result-ok { color: #1f8a4c; } .result-warn { color: #d63a3a; }
    .bubble { position: fixed; z-index: 2147483646; background: #1b2430; color: #fff; font-size: 12px; font-weight: 600;
      padding: 4px 9px; border-radius: 8px; white-space: nowrap; pointer-events: none; transform: translate(-100%, -100%);
      box-shadow: 0 2px 8px rgba(0,0,0,.2); }
    .bubble::after { content: ""; position: absolute; right: 10px; bottom: -5px; border: 5px solid transparent; border-bottom: 0; border-top-color: #1b2430; }
    .bubble.fail { background: #d63a3a; } .bubble.fail::after { border-top-color: #d63a3a; }
  `;

  function mount() {
    host = document.createElement('div');
    host.id = 'consent-cleaner-overlay';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${STYLE}</style>`;
    document.documentElement.appendChild(host);
    const loop = () => { placeBubbles(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  function unmount() {
    cancelAnimationFrame(raf);
    if (host) host.remove();
    host = root = null;
    bubbles.length = 0;
  }
  function addBubble(el, text, fail) {
    const node = document.createElement('div');
    node.className = 'bubble' + (fail ? ' fail' : '');
    node.textContent = text;
    root.appendChild(node);
    bubbles.push({ el, node });
  }
  function placeBubbles() {
    for (const { el, node } of bubbles) {
      const r = el.getBoundingClientRect();
      node.style.left = `${Math.max(r.right + 6, 120)}px`;
      node.style.top = `${r.top - 8}px`;
      node.style.display = r.width ? '' : 'none';
    }
  }

  // ---- 메인 ----
  function show(plan) {
    return new Promise((resolve) => {
      if (host) unmount();
      mount();
      const items = plan.targets.map((t) => ({ ...t, el: document.querySelector(`[data-cc-id="${CSS.escape(t.id)}"]`) }));
      const missing = items.filter((t) => !t.el);
      const found = items.filter((t) => t.el);
      found.forEach((t) => { highlight(t.el); addBubble(t.el, t.reason); });
      if (found[0]) found[0].el.scrollIntoView({ block: 'center', behavior: 'smooth' });

      const banner = document.createElement('div');
      banner.className = 'banner';
      banner.setAttribute('role', 'dialog');
      banner.innerHTML = `
        <div class="brand">동의 클리너</div>
        <p class="title">AI가 아래 ${found.length}개 항목의 수신 동의를 해제하려고 합니다</p>
        <ul>${found.map((t) => `<li data-id="${esc(t.id)}"><span>${esc(t.short)}</span><span class="r">${esc(t.reason)}</span></li>`).join('')}</ul>
        <div class="note">승인하면 노란색 항목만 끄고 「${esc(plan.save_label || '저장')}」을 누릅니다. 탈퇴·결제·로그아웃은 누르지 않아요.</div>
        <div class="btns"><button class="cancel">취소</button><button class="ok">승인</button></div>`;
      root.appendChild(banner);
      const okBtn = banner.querySelector('.ok');
      const cancelBtn = banner.querySelector('.cancel');
      okBtn.focus();

      let finished = false;
      const timer = setTimeout(() => cancel('timeout'), APPROVE_TIMEOUT);
      const cancel = (reason) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        found.forEach((t) => unhighlight(t.el));
        unmount();
        resolve({ status: 'cancelled', reason });
      };
      cancelBtn.addEventListener('click', () => cancel('user'));

      okBtn.addEventListener('click', async () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        okBtn.disabled = cancelBtn.disabled = true;
        banner.querySelector('.title').textContent = '해제하는 중…';

        // 1) 아직 켜져 있는 대상만 click() (상태를 직접 바꾸지 않고 사이트의 이벤트가 돌게)
        for (const t of found) {
          if (needsClick(t.el, t.kind)) { t.el.click(); await sleep(150); }
        }
        // 2) 저장 버튼
        const saveEl = plan.save_id && document.querySelector(`[data-cc-id="${CSS.escape(plan.save_id)}"]`);
        if (saveEl) saveEl.click();
        // 3) 2초 뒤 실제로 꺼졌는지 다시 읽기
        await sleep(2000);
        const changed = found.filter((t) => isRevoked(t.el, t.kind));
        const failed = [...found.filter((t) => !isRevoked(t.el, t.kind)), ...missing];

        // 결과 표시: 성공은 강조 해제, 실패는 강조 유지 + "직접 꺼주세요"
        bubbles.splice(0).forEach((b) => b.node.remove());
        changed.forEach((t) => unhighlight(t.el));
        failed.filter((t) => t.el).forEach((t) => addBubble(t.el, '이 항목은 직접 꺼주세요', true));
        banner.querySelectorAll('li').forEach((li) => {
          li.classList.add(changed.some((t) => t.id === li.dataset.id) ? 'ok' : 'fail');
        });
        const title = banner.querySelector('.title');
        if (failed.length) {
          title.innerHTML = `<span class="result-warn">${changed.length}개 해제 · ${failed.length}개는 직접 꺼주세요</span>`;
        } else {
          title.innerHTML = `<span class="result-ok">✓ ${changed.length}개 항목 해제 완료${saveEl ? ' · 저장됨' : ''}</span>`;
        }
        banner.querySelector('.note').textContent = failed.length
          ? '빨간 말풍선이 붙은 항목은 직접 끈 뒤 저장해 주세요.'
          : '동의 클리너 체크리스트로 돌아갑니다.';
        banner.querySelector('.btns').innerHTML = '<button class="close">닫기</button>';
        banner.querySelector('.close').addEventListener('click', () => {
          failed.filter((t) => t.el).forEach((t) => unhighlight(t.el));
          unmount();
        });

        resolve({
          status: 'done',
          changed: changed.map((t) => t.short),
          failed: failed.map((t) => t.short),
          saved: !!saveEl,
        });
      });
    });
  }

  // 짧은 안내 배너 (클릭 없음): 대상을 못 찾았을 때 등
  function notice(text, ms = 10000) {
    if (host) unmount();
    mount();
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<div class="brand">동의 클리너</div><p class="title" style="font-size:15px">${esc(text)}</p>
      <div class="btns"><button class="close">닫기</button></div>`;
    root.appendChild(banner);
    const timer = setTimeout(unmount, ms);
    banner.querySelector('.close').addEventListener('click', () => { clearTimeout(timer); unmount(); });
  }

  window.__ccOverlay = { show, notice };
  return 'ready';
})();
