// 확장 background (service worker)
// - REVOKE (웹, settings_url 있음): 설정 페이지 열기 → (로그인 대기) → 스캔 → 해제 대상 → 승인 배너 → 결과를 웹으로
// - GUIDE  (웹, settings_url 없음): 서비스 홈페이지를 열고 확장 아이콘에 안내 표시
// - SCAN_ACTIVE (팝업): 지금 보고 있는 탭에서 같은 흐름 실행 → 결과를 체크리스트에 도메인으로 반영
importScripts('core.js');

async function handleRevoke(payload, webTabId) {
  const url = payload && payload.settings_url;
  if (!isSafeUrl(url)) return { status: 'error', error: '설정 페이지 주소가 올바르지 않아요.' };

  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);

  const scan = await scanUntilLoggedIn(tab.id);
  if (scan.status === 'need_login') return { status: 'need_login', tabId: tab.id, error: '로그인이 필요해요. 열린 탭에서 로그인한 뒤 다시 시도해 주세요.' };
  if (scan.status !== 'ok') return { status: 'error', tabId: tab.id, error: scan.error || '페이지를 읽지 못했어요.' };

  const plan = await buildPlan(scan);
  if (!plan.targets.length) {
    await showNotice(tab.id, NOT_FOUND);
    return { status: 'done', changed: [], failed: [], note: '이미 꺼져 있거나 끌 항목이 없어요.', tabId: tab.id };
  }

  // 강조 + 승인 배너. 사용자가 [승인]/[취소]할 때까지 기다린다.
  const outcome = await runOverlay(tab.id, plan);
  console.log('[cc] 결과', outcome);
  if (outcome.status === 'done' && !outcome.failed.length && webTabId) {
    // 결과 배너를 잠깐 보여준 뒤 체크리스트 탭으로 돌아간다
    setTimeout(() => chrome.tabs.update(webTabId, { active: true }).catch(() => {}), 1800);
  }
  return { ...outcome, tabId: tab.id, mode: plan.mode, targets: plan.targets.map((t) => t.short) };
}

// 설정 페이지 주소를 모르는 실제 서비스: 홈페이지를 열고, 확장 아이콘에 "?" 표시 + 팝업에 안내
async function handleGuide(payload) {
  const domain = String((payload && payload.domain) || '').toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { status: 'error', error: '서비스 도메인이 올바르지 않아요.' };
  const tab = await chrome.tabs.create({ url: `https://${domain}/`, active: true });
  await chrome.storage.session.set({ [`guide:${tab.id}`]: { service: payload.service || domain, domain } });
  chrome.action.setBadgeText({ tabId: tab.id, text: '?' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#2156d9' }).catch(() => {});
  chrome.action.setTitle({ tabId: tab.id, title: `동의 클리너: ${payload.service || domain} 알림 설정 페이지에서 눌러주세요` }).catch(() => {});
  return { status: 'guided', tabId: tab.id };
}

// 팝업 → 현재 탭. 배너를 띄우기 직전까지 결과를 팝업에 돌려주고(respond), 승인 결과는 웹으로 알린다.
async function handleScanActive(tabId, respond) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return respond({ status: 'error', message: '탭을 찾을 수 없어요.' }); }
  if (!/^https?:\/\//.test(tab.url || '')) return respond({ status: 'error', message: '일반 웹페이지에서만 사용할 수 있어요.' });
  const host = new URL(tab.url).hostname;

  let scan;
  try { scan = await scanTab(tabId); } catch (e) { return respond({ status: 'error', message: `이 페이지는 읽을 수 없어요 (${e.message})` }); }
  if (scan.status === 'need_login') return respond({ status: 'need_login', message: '로그인 화면이에요. 로그인한 뒤 알림 설정 페이지에서 다시 눌러주세요.' });
  if (scan.status !== 'ok') return respond({ status: 'error', message: scan.error || '페이지를 읽지 못했어요.' });

  let plan;
  try { plan = await buildPlan(scan); } catch (e) { return respond({ status: 'error', message: `동의 클리너 서버에 연결하지 못했어요 (${e.message}). npm start 상태를 확인해주세요.` }); }
  if (!plan.targets.length) {
    await showNotice(tabId, NOT_FOUND);
    return respond({ status: 'none', message: NOT_FOUND, scanned: plan.scanned });
  }

  respond({ status: 'banner', count: plan.targets.length });
  const outcome = await runOverlay(tabId, plan);
  console.log('[cc] 결과 (팝업)', host, outcome);
  if (outcome.status === 'done') {
    chrome.action.setBadgeText({ tabId, text: outcome.failed.length ? '!' : '✓' }).catch(() => {});
    await notifyWeb({ type: 'REVOKED', host, result: outcome });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return false;
  const fromWeb = (sender.origin || (sender.url ? new URL(sender.url).origin : '')) === WEB_ORIGIN;
  const fromPopup = !sender.tab && (sender.url || '').startsWith(`chrome-extension://${chrome.runtime.id}/popup.html`);
  const reply = (p) => p.then(sendResponse).catch((e) => sendResponse({ status: 'error', error: e.message }));

  if (fromWeb && msg.type === 'REVOKE') { reply(handleRevoke(msg.payload, sender.tab && sender.tab.id)); return true; }
  if (fromWeb && msg.type === 'GUIDE') { reply(handleGuide(msg.payload)); return true; }
  if (fromPopup && msg.type === 'SCAN_ACTIVE') {
    handleScanActive(msg.tabId, sendResponse).catch((e) => { try { sendResponse({ status: 'error', message: e.message }); } catch {} });
    return true;
  }
  if (fromWeb || fromPopup) sendResponse({ status: 'error', error: `알 수 없는 요청: ${msg.type}` });
  return false;
});

// 탭이 닫히면 안내 정보 정리
chrome.tabs.onRemoved.addListener((tabId) => { chrome.storage.session.remove(`guide:${tabId}`).catch(() => {}); });
