// 발신 도메인 정리 규칙: 본 도메인 합치기, 개인 메일 제외, 기관(학교·공공기관·내 회사) 구분

// 2단계 공용 도메인의 두 번째 칸 (shop.co.kr, snu.ac.kr, school.hs.kr, shop.co.jp, shop.com.au …)
const SECOND_LEVEL = new Set(['co', 'or', 'ne', 'go', 'ac', 're', 'pe', 'mil', 'hs', 'ms', 'es', 'sc', 'kg',
  'com', 'net', 'org', 'edu', 'gov']);

// news.xxx.com, mail.xxx.co.kr, email.xxx.com → xxx.com, xxx.co.kr
function baseDomain(domain) {
  const parts = String(domain).toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const tld = parts[parts.length - 1], second = parts[parts.length - 2];
  const n = tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return parts.slice(-n).join('.');
}

// 개인 메일 서비스: 친구·동료가 보낸 메일이라 "가입한 서비스"가 아니다
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com', 'korea.com',
  'outlook.com', 'outlook.kr', 'hotmail.com', 'hotmail.co.kr', 'live.com', 'live.co.kr', 'msn.com',
  'yahoo.com', 'yahoo.co.kr', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com',
]);
const isPersonal = (domain) => PERSONAL_DOMAINS.has(domain);

// 학교·공공기관: 광고 동의 해제 대상이 아니다
const INSTITUTION = [
  /\.(ac|go|or|mil|re|hs|ms|es|sc|kg)\.kr$/, // 대학·정부·공공(비영리)·군·연구소·초중고
  /\.(edu|gov|mil)(\.[a-z]{2})?$/, // 해외 학교·정부
  /\.(ac|go)\.[a-z]{2}$/, // ac.jp, go.jp 등
];
// selfDomain: 사용자 메일이 회사·학교 주소라면 그 도메인에서 온 메일은 동료 메일
function isInstitution(domain, selfDomain) {
  if (selfDomain && !isPersonal(selfDomain) && domain === baseDomain(selfDomain)) return true;
  return INSTITUTION.some((re) => re.test(domain));
}

// 서비스 이름으로 묶을 때 쓰면 안 되는 흔한 발신자 이름
const GENERIC_NAMES = /^(no-?reply|do-?not-?reply|noreply|support|help|info|news|newsletter|notification|notifications|notice|admin|team|service|mailer|hello|marketing|고객센터|알림|안내|공지|관리자|운영팀|뉴스레터)$/i;
const normName = (s) => String(s || '').toLowerCase().replace(/[\s·.,_\-()[\]'"]/g, '').replace(/(코리아|korea|inc|corp|team|팀)$/g, '');

// 발신자 이름 정리: "Andy from AhaSlides" → "AhaSlides", "♟Chess.com" → "Chess.com",
// "Notion Team" → "Notion", "Anthropic, PBC" → "Anthropic", "SheerID Verification" → "SheerID"
function cleanName(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/["'“”‘’]/g, '');
  s = s.replace(/[\p{Extended_Pictographic}☀-➿️‍]/gu, ' ');
  s = s.replace(/^.{1,30}?\s+(from|at|@)\s+(?=\S)/i, ''); // "Andy from X"
  s = s.replace(/^.{1,20}?\s*[|｜]\s*/, (m) => (m.length < s.length / 2 ? '' : m)); // "Andy | X"
  for (let i = 0; i < 2; i++) {
    s = s.replace(/[,\s]+(inc\.?|llc|ltd\.?|pbc|corp\.?|co\.,?\s*ltd\.?|gmbh|주식회사|\(주\))$/i, '');
    s = s.replace(/\s+(team|팀|verification|notifications?|support|news|newsletter|alerts?|updates?|no-?reply)$/i, '');
  }
  s = s.replace(/^\(주\)\s*|^주식회사\s*|^the\s+/i, '').replace(/\s+/g, ' ').trim();
  return s || String(raw).trim();
}

// 모르는 서비스의 홈페이지 추측: 메일 전용 도메인(facebookmail.com 등)보다 본 도메인을 고른다
// "facebookmail.com" → facebook.com 처럼 끝의 mail/email 을 떼어 본다
function guessHomepage(domains) {
  const list = (domains || []).filter(Boolean);
  if (!list.length) return null;
  const strip = (d) => {
    // "mail" 떼기(남는 이름 6자 이상) → 안 되면 "email" 떼기(5자 이상). 짧으면 그대로 (엉뚱한 사이트 방지)
    const m = d.match(/^([a-z0-9-]{6,})(mail|mailer)\.([a-z.]+)$/) || d.match(/^([a-z0-9-]{5,})(email)\.([a-z.]+)$/);
    return m ? `${m[1]}.${m[3]}` : d;
  };
  const plain = list.filter((d) => !/mail/.test(d.split('.')[0])).sort((a, b) => a.length - b.length)[0] || strip(list[0]);
  return `https://${plain}/`;
}

module.exports = { baseDomain, isPersonal, isInstitution, GENERIC_NAMES, normName, cleanName, guessHomepage, PERSONAL_DOMAINS };
