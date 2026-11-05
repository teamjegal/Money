// .mbox 또는 붙여넣은 메일 텍스트 → 메일 목록 → 서비스(도메인)별 그룹
const { simpleParser } = require('mailparser');
const { baseDomain, isPersonal, isInstitution, cleanName } = require('./domains');

// mbox 구분줄: "From 보낸사람 요일 월 일 시:분:초 연도"
const FROM_LINE = /^From \S+ +\w{3} \w{3} +\d{1,2} \d{2}:\d{2}(:\d{2})? \d{4}/;

// 메일 종류 판별 규칙 (위에 있을수록 우선). 해외 서비스는 "(광고)" 표기가 없어서 영어 키워드도 본다.
const RULES = [
  { type: 'ad', re: /[(\[]\s*광고\s*[)\]]/ },
  // 휴면 + 계정 삭제 예고 (LLM이 실제 메일함에서 찾은 신호를 규칙에도 반영)
  { type: 'dormant', re: /휴면|장기\s*미이용|계정\s*(삭제|정지)\s*(예정|예고|안내)|삭제\s*예정|inactive account|account (will be|has been|is scheduled to be) (deleted|deactivated|closed)|account deletion|will be (permanently )?deleted|scheduled for deletion/i },
  { type: 'security', re: /보안\s*(알림|경고)|로그인\s*(알림|시도)|새로운\s*(기기|로그인)|인증\s*(코드|번호)|비밀번호\s*(변경|재설정)|security alert|new (sign-?in|login|device)|verification code|password (reset|changed)|2-step/i },
  { type: 'privacy', re: /개인정보\s*(이용|처리)\s*(내역|방침)|이용\s*약관|privacy (policy|notice)|terms of (service|use)/i },
  { type: 'signup', re: /가입을?\s*환영|회원\s*가입이?\s*완료|가입이\s*완료|이메일\s*인증|본인\s*인증|welcome to|verify your (email|account)|confirm your (email|account)|account (created|confirmed)/i },
  { type: 'order', re: /주문(이|이\s*완료|\s*완료|\s*확인|\s*내역|번호)|결제\s*(완료|안내|내역)|영수증|예매\s*완료|예약\s*(완료|확정)|구매\s*완료|구독\s*(갱신|결제)|청구서|거래\s*(확인|내역)|이용\s*내역|송금|receipt|transaction|invoice|your order|order (confirm|#|\d)|payment (received|confirm)|billing|subscription (renew|confirm)/i },
  { type: 'promo', body: false, re: /할인|쿠폰|특가|세일|이벤트|혜택|적립|프로모션|기획전|신상|무료\s*배송|단독|오늘만|마감\s*임박|\d+\s*%|sale\b|deals?\b|offer|discount|coupon|promo|newsletter|뉴스레터|digest|weekly|new arrivals|don'?t miss|limited time/i },
];

const LABELS = {
  ad: (n) => `광고 메일 ${n}건`,
  promo: (n) => `마케팅 메일 ${n}건`,
  notice: (n) => `서비스 알림 메일 ${n}건 (수신거부 가능)`,
  signup: () => '가입 환영/인증 메일',
  privacy: () => '개인정보·약관 안내',
  dormant: () => '휴면 전환 안내',
  security: () => '보안·로그인 알림',
  order: (n) => `주문/결제 메일 ${n}건`,
};

// 텍스트를 메일 원문 단위로 나눈다
function splitMessages(text) {
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const hasFromLines = lines.some((l) => FROM_LINE.test(l));
  if (!hasFromLines) {
    // 붙여넣기: 빈 줄 3개 이상 또는 "-----" 구분선으로 여러 통을 나눌 수 있게
    return String(text).replace(/\r\n?/g, '\n').split(/\n{3,}(?=\S+:)|\n-{5,}\n/)
      .map((s) => s.trim()).filter(Boolean);
  }
  const msgs = [];
  let cur = null;
  for (const line of lines) {
    if (FROM_LINE.test(line)) {
      if (cur) msgs.push(cur.join('\n'));
      cur = [];
    } else if (cur) {
      // mbox 이스케이프 복원: ">From " → "From "
      cur.push(/^>+From /.test(line) ? line.slice(1) : line);
    }
  }
  if (cur) msgs.push(cur.join('\n'));
  return msgs.filter((m) => m.trim());
}

// 헤더 없이 붙여넣은 경우를 위해 "보낸사람:" 같은 한국어 헤더도 영어로 바꿔준다
function normalizePasted(raw) {
  const map = { '보낸사람': 'From', '보낸 사람': 'From', '발신자': 'From', '제목': 'Subject', '날짜': 'Date', '받는사람': 'To', '받는 사람': 'To' };
  return raw.replace(/^(보낸 ?사람|발신자|제목|날짜|받는 ?사람)\s*:/gm, (m, k) => `${map[k] || k}:`);
}

function toDateStr(d) {
  if (!d || isNaN(d)) return null;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 기준
}

function pickUnsubscribe(parsed) {
  const list = parsed.headers.get('list');
  const u = list && list.unsubscribe;
  const items = Array.isArray(u) ? u : u ? [u] : [];
  const http = items.find((x) => x.url && /^https?:/i.test(x.url));
  if (http) return http.url;
  const mail = items.find((x) => x.mail);
  if (mail) return `mailto:${mail.mail}`;
  // 헤더가 없으면 본문의 "수신거부: URL" 을 찾아본다
  const m = (parsed.text || '').match(/수신\s*거부[^\n]*?(https?:\/\/\S+)/);
  return m ? m[1] : null;
}

// 본문으로는 판단하지 않는 종류: 광고 표기는 제목 기준, 할인·보안 단어는 본문 꼬리말에 흔해서
const SUBJECT_ONLY = new Set(['ad', 'promo', 'security']);

function classify(subject, body, hasUnsubscribe = false) {
  for (const r of RULES) if (r.re.test(subject)) return r.type;
  for (const r of RULES) if (!SUBJECT_ONLY.has(r.type) && r.re.test(body)) return r.type;
  // 할인·이벤트 단어 없이 수신거부 링크(List-Unsubscribe)만 있는 대량 발송 = 서비스 알림 (광고와 구분)
  return hasUnsubscribe ? 'notice' : 'info';
}

// 메일 원문 하나 파싱
async function parseOne(raw) {
  const parsed = await simpleParser(normalizePasted(raw));
  let addr = parsed.from && parsed.from.value[0];
  // 헤더 없이 본문만 붙여넣으면 mailparser가 본문을 헤더로 읽어 버리므로 원문을 본문으로 쓴다
  const noHeaders = !parsed.from && !parsed.subject && !parsed.date;
  const text = (noHeaders ? raw : parsed.text || '').trim();
  if (!addr || !addr.address) {
    // From 헤더가 없으면 본문에서 첫 이메일 주소를 찾는다
    const m = raw.match(/[\w.+-]+@([\w-]+\.)+[\w-]+/);
    addr = m ? { address: m[0], name: '' } : null;
  }
  if (!addr) return null;
  const subject = parsed.subject || '';
  const contact = text.match(/(privacy|dpo|personal)[\w.-]*@[\w.-]+\.\w+/i);
  // mailparser는 List-Unsubscribe-Post를 headers.get('list')['unsubscribe-post'] 에 넣는다
  const post = (parsed.headers.get('list') || {})['unsubscribe-post'];
  const unsubscribe = pickUnsubscribe(parsed);
  // RFC 8058 원클릭: List-Unsubscribe-Post 헤더 + List-Unsubscribe 헤더의 https 링크일 때만 (본문 링크는 절대 아님)
  const headerUrls = [].concat(((parsed.headers.get('list') || {}).unsubscribe) || []).map((x) => x && x.url).filter(Boolean);
  const oneClick = /one-click/i.test(typeof post === 'string' ? post : JSON.stringify(post || ''))
    && /^https:\/\//i.test(unsubscribe || '') && headerUrls.includes(unsubscribe);
  return {
    from: addr.address.toLowerCase(),
    fromName: addr.name || '',
    subject,
    date: parsed.date && !isNaN(parsed.date) ? parsed.date : null,
    unsubscribe,
    oneClick,
    snippet: text.slice(0, 500),
    contactEmail: contact ? contact[0].toLowerCase() : null,
    // 헤더의 List-Unsubscribe만 대량 발송 신호로 본다 (본문 속 "수신거부" 링크는 제외)
    type: classify(subject, text, !!(parsed.headers.get('list') || {}).unsubscribe),
  };
}

async function parseMessages(text) {
  return parseRawMessages(splitMessages(text));
}

// 메일 원문(또는 Gmail에서 받은 헤더만 있는 원문) 배열 파싱
async function parseRawMessages(raws) {
  const out = [];
  for (const raw of raws) {
    try {
      const mail = await parseOne(raw);
      if (mail) out.push(mail);
    } catch (e) {
      // 깨진 메일 한 통 때문에 전체가 멈추지 않게
    }
  }
  return out;
}

// 그룹 이름·종류별 건수 → 화면에 보일 신호 문구
const signalsOf = (counts) => Object.keys(LABELS).filter((t) => counts[t]).map((t) => LABELS[t](counts[t]));
const ACCOUNT_SIGNALS = ['signup', 'privacy', 'order', 'dormant', 'security']; // 가입·이용이 확실한 신호

// selfDomain: 사용자 메일 주소의 도메인 (회사·학교 메일이면 그 도메인은 "기관")
function groupByDomain(mails, { selfDomain } = {}) {
  const groups = new Map();
  for (const m of mails) {
    const domain = baseDomain(m.from.split('@')[1] || '');
    if (!domain || isPersonal(domain)) continue; // 개인 간 메일 제외
    if (!groups.has(domain)) groups.set(domain, { domain, mails: [] });
    groups.get(domain).mails.push(m);
  }
  return [...groups.values()].map((g) => summarize(g, selfDomain)).sort((a, b) => b.count - a.count);
}

function summarize({ domain, mails }, selfDomain) {
  // 날짜 있는 것 먼저, 최신순
  const sorted = [...mails].sort((a, b) => (b.date || 0) - (a.date || 0));
  const dated = sorted.filter((m) => m.date);
  const counts = { ad: 0, promo: 0, notice: 0, signup: 0, privacy: 0, dormant: 0, security: 0, order: 0, info: 0 };
  const lastByType = {};
  for (const m of sorted) {
    counts[m.type] = (counts[m.type] || 0) + 1;
    if (!lastByType[m.type] && m.date) lastByType[m.type] = toDateStr(m.date);
  }
  // 표시 이름: 가장 많이 쓰인 발신자 이름
  const nameCount = {};
  for (const m of mails) if (m.fromName) nameCount[m.fromName] = (nameCount[m.fromName] || 0) + 1;
  const name = cleanName(Object.entries(nameCount).sort((a, b) => b[1] - a[1])[0]?.[0]) || domain.split('.')[0];
  const lastMarketing = [lastByType.ad, lastByType.promo].filter(Boolean).sort().pop() || null;

  return {
    name,
    domain,
    domains: [domain],
    kind: isInstitution(domain, selfDomain) ? 'institution' : 'service',
    count: mails.length,
    first_seen: dated.length ? toDateStr(dated[dated.length - 1].date) : null,
    last_seen: dated.length ? toDateStr(dated[0].date) : null,
    subjects: [...new Set(sorted.map((m) => m.subject).filter(Boolean))].slice(0, 8),
    unsubscribe: sorted.find((m) => m.unsubscribe)?.unsubscribe || null,
    unsubscribe_one_click: !!sorted.find((m) => m.unsubscribe)?.oneClick,
    contact_email: sorted.find((m) => m.contactEmail)?.contactEmail || null,
    counts,
    last_ad: lastMarketing, // 광고 + 마케팅 중 가장 최근 (서비스 알림 제외)
    last_notice: lastByType.notice || null,
    last_order: lastByType.order || null,
    last_security: lastByType.security || null,
    last_signup: lastByType.signup || null,
    last_dormant: lastByType.dormant || null,
    // 1~2통뿐이고 가입·이용 신호가 없으면 "확인 필요" (진짜 가입했는지 불확실)
    weak: mails.length <= 2 && !ACCOUNT_SIGNALS.some((t) => counts[t]),
    signals: signalsOf(counts),
    snippets: sorted.slice(0, 3).map((m) => m.snippet.slice(0, 200)),
  };
}

// 진입점: 텍스트 → 그룹 목록
async function analyzeMailText(text) {
  const mails = await parseMessages(text);
  return { total: mails.length, groups: groupByDomain(mails) };
}

module.exports = { analyzeMailText, parseMessages, parseRawMessages, groupByDomain, splitMessages, baseDomain, classify, signalsOf };
