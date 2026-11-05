// .mbox 또는 붙여넣은 메일 텍스트 → 메일 목록 → 서비스(도메인)별 그룹
const { simpleParser } = require('mailparser');

// mbox 구분줄: "From 보낸사람 요일 월 일 시:분:초 연도"
const FROM_LINE = /^From \S+ +\w{3} \w{3} +\d{1,2} \d{2}:\d{2}(:\d{2})? \d{4}/;

// 두 단계 공용 도메인 (예: shop.co.kr → 마지막 3단계가 서비스)
const SECOND_LEVEL = new Set(['co', 'or', 'ne', 'go', 'ac', 're', 'pe', 'com', 'net', 'org']);

// 메일 종류 판별 규칙 (위에 있을수록 우선)
const RULES = [
  { type: 'ad', re: /[(\[]\s*광고\s*[)\]]/ },
  { type: 'dormant', re: /휴면|장기\s*미이용/ },
  { type: 'privacy', re: /개인정보\s*(이용|처리)\s*내역/ },
  { type: 'signup', re: /가입을?\s*환영|회원\s*가입이?\s*완료|가입이\s*완료|이메일\s*인증|본인\s*인증/ },
  { type: 'order', re: /주문|결제\s*완료|영수증|예매\s*완료|예약\s*완료|구매\s*완료/ },
];

const LABELS = {
  ad: (n) => `광고 메일 ${n}건`,
  signup: () => '가입 환영/인증 메일',
  privacy: () => '개인정보 이용내역 안내',
  dormant: () => '휴면 전환 안내',
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

function classify(subject, body) {
  for (const r of RULES) if (r.re.test(subject)) return r.type;
  for (const r of RULES) if (r.type !== 'ad' && r.re.test(body)) return r.type;
  return 'info';
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
  return {
    from: addr.address.toLowerCase(),
    fromName: addr.name || '',
    subject,
    date: parsed.date && !isNaN(parsed.date) ? parsed.date : null,
    unsubscribe: pickUnsubscribe(parsed),
    oneClick: /one-click/i.test(typeof post === 'string' ? post : JSON.stringify(post || '')), // RFC 8058 원클릭 수신거부
    snippet: text.slice(0, 500),
    contactEmail: contact ? contact[0].toLowerCase() : null,
    type: classify(subject, text),
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

// mail.xxx.com, news.xxx.co.kr → xxx.com, xxx.co.kr
function baseDomain(domain) {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const n = SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

// 개인 메일 서비스 도메인: 친구·동료가 보낸 메일이라 "가입한 서비스"가 아니다
const PERSONAL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com',
  'nate.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com']);

function groupByDomain(mails) {
  const groups = new Map();
  for (const m of mails) {
    const domain = baseDomain(m.from.split('@')[1] || '');
    if (!domain || PERSONAL_DOMAINS.has(domain)) continue;
    if (!groups.has(domain)) groups.set(domain, { domain, mails: [] });
    groups.get(domain).mails.push(m);
  }
  return [...groups.values()].map(summarize).sort((a, b) => b.count - a.count);
}

function summarize({ domain, mails }) {
  // 날짜 있는 것 먼저, 최신순
  const sorted = [...mails].sort((a, b) => (b.date || 0) - (a.date || 0));
  const dated = sorted.filter((m) => m.date);
  const counts = { ad: 0, signup: 0, privacy: 0, dormant: 0, order: 0, info: 0 };
  const lastByType = {};
  for (const m of sorted) {
    counts[m.type]++;
    if (!lastByType[m.type] && m.date) lastByType[m.type] = toDateStr(m.date);
  }
  // 표시 이름: 가장 많이 쓰인 발신자 이름
  const nameCount = {};
  for (const m of mails) if (m.fromName) nameCount[m.fromName] = (nameCount[m.fromName] || 0) + 1;
  const name = Object.entries(nameCount).sort((a, b) => b[1] - a[1])[0]?.[0] || domain.split('.')[0];

  const subjects = [...new Set(sorted.map((m) => m.subject).filter(Boolean))].slice(0, 8);
  const signals = Object.keys(LABELS).filter((t) => counts[t]).map((t) => LABELS[t](counts[t]));

  return {
    name,
    domain,
    count: mails.length,
    first_seen: dated.length ? toDateStr(dated[dated.length - 1].date) : null,
    last_seen: dated.length ? toDateStr(dated[0].date) : null,
    subjects,
    unsubscribe: sorted.find((m) => m.unsubscribe)?.unsubscribe || null,
    unsubscribe_one_click: !!sorted.find((m) => m.unsubscribe)?.oneClick,
    contact_email: sorted.find((m) => m.contactEmail)?.contactEmail || null,
    counts,
    last_ad: lastByType.ad || null,
    last_order: lastByType.order || null,
    last_dormant: lastByType.dormant || null,
    signals,
    snippets: sorted.slice(0, 3).map((m) => m.snippet.slice(0, 200)),
  };
}

// 진입점: 텍스트 → 그룹 목록
async function analyzeMailText(text) {
  const mails = await parseMessages(text);
  return { total: mails.length, groups: groupByDomain(mails) };
}

module.exports = { analyzeMailText, parseMessages, parseRawMessages, groupByDomain, splitMessages, baseDomain, classify };
