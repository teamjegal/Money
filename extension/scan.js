// 설정 페이지 스캔 (chrome.scripting.executeScript({files:['scan.js']}) 로 페이지에 주입)
// 클릭은 하지 않는다. 컨트롤 목록과 라벨만 읽어서 돌려준다.
// 마지막 식의 값이 executeScript 결과가 된다.
(() => {
  const CONTROL_SELECTOR = 'input[type=checkbox], input[type=radio], [role=switch], [role=checkbox], button, a[href], input[type=submit], input[type=button]';
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);

  // 텍스트 노드를 띄어쓰기로 이어 붙인다 (span 여러 개가 붙어버리지 않게)
  function textOf(node, skip) {
    const parts = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (skip && skip.contains(t) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode()) {
      const p = walker.currentNode.parentElement;
      if (p && (p.closest('script, style, noscript') || p.closest('[aria-hidden=true]'))) continue;
      const t = walker.currentNode.textContent.trim();
      if (t) parts.push(t);
    }
    return clean(parts.join(' '));
  }

  const MAX_CONTROLS = 200; // 실제 사이트는 링크가 수백 개라 상한
  const overlayHost = document.getElementById('consent-cleaner-overlay');

  // 화면에 실제로 보이는 요소만 (크기 0, 숨김, aria-hidden, 우리 배너 안은 제외)
  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    if (overlayHost && overlayHost.contains(el)) return false;
    return true;
  }

  // 라벨 찾기: label[for] → 감싸는 label → aria-label → aria-labelledby → 옆 텍스트
  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && textOf(l)) return { label: textOf(l), via: 'label-for' };
    }
    const wrap = el.closest('label');
    if (wrap && textOf(wrap, el)) return { label: textOf(wrap, el), via: 'label-wrap' };
    if (el.getAttribute('aria-label')) return { label: clean(el.getAttribute('aria-label')), via: 'aria-label' };
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const byIds = clean(ids.map((id) => document.getElementById(id)).filter(Boolean).map((n) => textOf(n)).join(' '));
    if (byIds) return { label: byIds, via: 'aria-labelledby' };
    // 옆 텍스트: 이 컨트롤 하나만 들어 있는 가장 가까운 조상의 글자
    let p = el.parentElement;
    for (let i = 0; p && i < 4; i++, p = p.parentElement) {
      if (p.querySelectorAll(CONTROL_SELECTOR).length > 1) break;
      const t = textOf(p, el);
      if (t) return { label: t, via: 'nearby-text' };
    }
    return { label: '', via: 'none' };
  }

  function kindOf(el) {
    const role = el.getAttribute('role');
    if (role === 'switch') return 'switch';
    if (el.matches('input[type=checkbox], [role=checkbox]')) return 'checkbox';
    if (el.matches('input[type=radio]')) return 'radio';
    if (el.matches('a')) return 'link';
    return 'button';
  }

  function checkedOf(el) {
    if ('checked' in el && el.matches('input')) return !!el.checked;
    const aria = el.getAttribute('aria-checked');
    return aria === null ? undefined : aria === 'true';
  }

  // 로그인 페이지인지: 보이는 비밀번호 칸이 있거나, 로그인 주소에서 아이디 칸만 보이는 경우(아이디 먼저 받는 로그인)
  const pw = [...document.querySelectorAll('input[type=password]')].some(isVisible);
  const loginUrl = /\/(log-?in|sign-?in|signin|auth\/|account\/login|session|sso)|accounts\.google\.com\/(v3\/)?signin|\/\/login\./i.test(location.href);
  const idField = [...document.querySelectorAll('input[type=email], input[autocomplete=username], input[name*=user i], input[name*=login i], input[name=email]')].some(isVisible);
  if (pw || (loginUrl && idField)) return { status: 'need_login', url: location.href };

  // 기존 번호를 이어서 쓴다 (다시 스캔해도 id 유지)
  let next = Math.max(0, ...[...document.querySelectorAll('[data-cc-id]')].map((e) => +e.dataset.ccId.slice(3) || 0)) + 1;
  const found = []; // { el, item }
  // iframe 안은 querySelectorAll에 안 잡힌다 (맨 위 문서만)
  for (const el of document.querySelectorAll(CONTROL_SELECTOR)) {
    const kind = kindOf(el);
    let label, via;
    if (kind === 'link' || kind === 'button') {
      // 버튼·링크는 자기 글자가 라벨. 옆 문장을 쓰면 "회원 탈퇴" 같은 위험 단어를 놓친다.
      label = clean([el.getAttribute('aria-label'), textOf(el), el.value, el.title].filter(Boolean).join(' '));
      via = 'own-text';
      if (!label) continue;
    } else {
      ({ label, via } = labelOf(el));
    }
    // 숨겨진 input은 연결된 label이 보이면 포함 (실제 사이트에서 input을 숨기고 label을 토글처럼 꾸미는 경우)
    const labelEl = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    if (!isVisible(el) && !(labelEl && isVisible(labelEl))) continue;
    const item = { kind, label, disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' };
    const checked = checkedOf(el);
    if (checked !== undefined) item.checked = checked;
    if (kind === 'link') item.href = el.getAttribute('href'); // 안전 필터용 (/withdraw 같은 주소)
    item.via = via;
    found.push({ el, item });
  }

  // 최대 200개: 토글(체크박스·스위치·라디오) → 버튼 → 링크 순으로 남긴다
  const rank = { checkbox: 0, switch: 0, radio: 0, button: 1, link: 2 };
  const kept = new Set([...found].sort((a, b) => rank[a.item.kind] - rank[b.item.kind]).slice(0, MAX_CONTROLS));
  const controls = [];
  for (const f of found) {
    if (!kept.has(f)) continue;
    if (!f.el.dataset.ccId) f.el.dataset.ccId = `cc-${next++}`;
    controls.push({ id: f.el.dataset.ccId, ...f.item });
  }
  return { status: 'ok', url: location.href, title: document.title, controls, total: found.length, truncated: found.length > MAX_CONTROLS };
})();
