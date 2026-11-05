// 데모쇼핑 공용: 로그인 상태·설정 저장 (시연용 가짜 쇼핑몰)
// 비밀번호는 어디에도 저장하지 않는다. 로그인 여부와 아이디만 기록.
window.DemoShop = (() => {
  const KEY_SESSION = 'demoShop.session';
  const KEY_PREFS = 'demoShop.prefs';
  const DEFAULT_PREFS = { email: true, sms: true, push: true, personalized: true, night: true };

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };
  const remove = (k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } };

  return {
    session: () => read(KEY_SESSION),
    login: (userId) => write(KEY_SESSION, { userId, at: Date.now() }),
    logout: () => remove(KEY_SESSION),
    prefs: () => ({ ...DEFAULT_PREFS, ...(read(KEY_PREFS) || {}) }),
    savePrefs: (p) => write(KEY_PREFS, p),
    resetPrefs: () => remove(KEY_PREFS),
    today: () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), // KST
  };
})();
