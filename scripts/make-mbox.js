// 시연용 샘플 메일함(samples/demo.mbox) 생성 스크립트
// 실행: node scripts/make-mbox.js
// 모든 서비스·도메인은 가상(.example)이다.
const fs = require('fs');
const path = require('path');

const TO = '김지우 <jiwoo.kim@mail.example>';

// 메일 종류: W=가입 환영, A=광고, P=개인정보 이용내역, D=휴면 전환, O=주문 완료, N=정보성 뉴스레터
const SERVICES = [
  { name: '데모쇼핑', domain: 'demo-shop.example', item: ['무선 이어폰', '텀블러 500ml'],
    privacy: true, ads: ['가을 맞이 최대 70% 할인', '회원님만을 위한 쿠폰 도착', '주말 한정 타임특가', '장바구니 상품 가격 인하'],
    events: 'W 2023-03-02, O 2023-05-14, O 2024-01-20, A 2024-06-11, A 2024-09-03, A 2024-12-19, A 2025-03-08, A 2025-05-27, A 2025-08-14, P 2025-09-01, A 2025-10-30, A 2026-01-15, A 2026-04-09, A 2026-07-22, D 2026-10-20' },
  { name: '하늘마켓', domain: 'haneulmarket.example', item: ['생수 2L x 12', '키친타월', '세탁세제'],
    ads: ['이번 주 신선식품 특가', '첫 정기배송 50% 할인'],
    events: 'W 2023-06-18, O 2024-11-02, A 2025-07-04, O 2025-12-21, A 2026-05-13, O 2026-09-28' },
  { name: '꿀딜마트', domain: 'ggulldeal.example', item: ['휴대폰 케이스'],
    ads: ['오늘만 이 가격! 꿀딜 TOP 10', '선착순 1000명 100원 딜', '놓치면 후회할 블랙위크'],
    events: 'W 2023-02-07, O 2023-04-22, A 2024-03-15, A 2024-11-25, A 2025-06-10, A 2026-02-03, A 2026-08-30' },
  { name: '시네마루', domain: 'cinemaru.example', item: ['영화 예매 2매'],
    ads: ['이번 주말 개봉작 할인 예매', '팝콘 콤보 무료 쿠폰'],
    events: 'W 2023-08-12, O 2024-02-17, A 2024-10-05, A 2025-04-19, A 2025-11-08, D 2026-03-01' },
  { name: '여기어디', domain: 'yeogieodi.example', item: ['제주 호텔 1박'],
    ads: ['여름휴가 숙소 얼리버드', '연말 호캉스 특가'],
    events: 'W 2023-11-03, O 2024-07-26, A 2025-05-02, P 2025-09-01, A 2025-11-20, A 2026-06-12' },
  { name: '책방도토리', domain: 'dotoribooks.example', item: ['장편소설 외 1권', '여행 에세이'],
    ads: ['이달의 베스트셀러 10% 적립'],
    events: 'W 2023-04-09, O 2024-05-30, A 2025-02-14, O 2026-01-08, A 2026-09-17' },
  { name: '핏앤런', domain: 'fitnrun.example',
    events: 'W 2024-01-02, P 2025-09-01' },
  { name: '배고파요', domain: 'baegopayo.example', item: ['치킨 1마리', '떡볶이 세트', '김밥 2줄'],
    ads: ['배달비 0원 주간', '첫 주문 3천원 할인'],
    events: 'W 2023-09-14, O 2025-03-21, A 2025-08-02, O 2026-02-27, A 2026-06-06, O 2026-10-11' },
  { name: '배움상자', domain: 'baeumsangja.example', item: ['파이썬 입문 강의'],
    ads: ['신규 강의 오픈 기념 할인', '수강권 1+1 이벤트', '자격증 패키지 특가'],
    events: 'W 2023-01-10, O 2023-01-10, A 2023-10-18, A 2024-06-22, D 2024-12-15, A 2025-07-30, A 2026-05-25' },
  { name: '동전일기', domain: 'dongjeonilgi.example',
    events: 'W 2024-03-27, P 2025-09-01' },
  { name: '멍냥마켓', domain: 'meongnyang.example',
    ads: ['사료·간식 최대 40% 할인', '반려동물 용품 신상 입고', '정기배송 첫 달 무료'],
    events: 'W 2023-05-05, A 2024-08-08, A 2025-04-04, A 2026-07-07' },
  { name: '뜰안채', domain: 'tteulanchae.example', item: ['원목 협탁'],
    ads: ['홈스타일링 기획전'],
    events: 'W 2024-09-09, O 2025-01-18, A 2026-03-20' },
  { name: '동네장터', domain: 'dongnejangteo.example',
    events: 'W 2023-07-21, P 2024-09-01, D 2026-08-01' },
  { name: '뉴스한입', domain: 'newshanip.example',
    events: 'W 2024-04-01, N 2025-06-02, N 2026-02-09, N 2026-10-05' },
  { name: '공연마루', domain: 'gongyeonmaru.example', item: ['뮤지컬 R석 1매'],
    ads: ['연말 공연 선예매 오픈'],
    events: 'W 2024-02-20, O 2024-04-13, A 2025-10-24' },
];

const NEWS = ['오늘의 경제 한입 요약', '이번 주 IT 소식 정리', '주간 생활 정보 모음'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 한글 헤더는 RFC 2047 인코딩
const enc = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
const pad = (n) => String(n).padStart(2, '0');

function dates(ymd, seq) {
  const [y, m, d] = ymd.split('-').map(Number);
  const h = 8 + (seq * 7) % 12, mi = (seq * 13) % 60;
  const dt = new Date(Date.UTC(y, m - 1, d, h, mi)); // 요일 계산용 (KST 시각을 그대로 담음)
  const day = DAYS[dt.getUTCDay()], mon = MONS[m - 1];
  return {
    fromLine: `${day} ${mon} ${pad(d)} ${pad(h)}:${pad(mi)}:00 ${y}`,
    header: `${day}, ${pad(d)} ${mon} ${y} ${pad(h)}:${pad(mi)}:00 +0900`,
  };
}

function build(svc, type, ymd, seq, counters) {
  const n = counters[type] = (counters[type] || 0) + 1;
  const footer = svc.privacy
    ? `\n\n---\n${svc.name} | 개인정보 관련 문의: privacy@${svc.domain}\n본 메일은 발신 전용입니다.`
    : `\n\n---\n${svc.name} | 본 메일은 발신 전용입니다.`;
  let sender = `noreply@${svc.domain}`, subject, body, extra = [];

  if (type === 'W') {
    subject = `[${svc.name}] 회원가입을 환영합니다!`;
    body = `김지우님, ${svc.name}에 가입해 주셔서 감사합니다.\n회원가입이 완료되었습니다.\n\n가입 시 광고성 정보 수신에 동의하셨습니다. (이메일/SMS)\n수신 설정은 [마이페이지 > 알림 설정]에서 언제든 변경할 수 있습니다.`;
  } else if (type === 'A') {
    sender = `ad@${svc.domain}`;
    const title = svc.ads[(n - 1) % svc.ads.length];
    const url = `https://unsubscribe.${svc.domain}/u?mid=${svc.domain.split('.')[0]}-${ymd.replace(/-/g, '')}`;
    subject = `(광고) [${svc.name}] ${title}`;
    body = `김지우님을 위한 혜택 소식!\n\n${title}\n지금 바로 확인해 보세요.\n\n※ 본 메일은 광고성 정보 수신에 동의하신 회원님께 발송되었습니다.\n수신을 원하지 않으시면 아래 링크에서 수신거부할 수 있습니다.\n수신거부: ${url}`;
    extra.push(`List-Unsubscribe: <${url}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  } else if (type === 'P') {
    subject = `[${svc.name}] 개인정보 이용내역 안내`;
    body = `김지우님, 「개인정보 보호법」에 따라 연 1회 개인정보 이용내역을 안내드립니다.\n\n- 수집 항목: 이름, 이메일, 휴대전화번호, 주소, 구매내역\n- 이용 목적: 회원 관리, 주문·배송, 마케팅 정보 제공(동의 시)\n- 보유 기간: 회원 탈퇴 시까지\n- 제3자 제공: 배송업체, 결제대행사`;
  } else if (type === 'D') {
    subject = `[${svc.name}] 휴면 계정 전환 예정 안내`;
    body = `김지우님, 1년 이상 장기 미이용으로 30일 후 계정이 휴면 상태로 전환될 예정입니다.\n\n휴면 전환 시 개인정보는 별도로 분리 보관되며,\n계속 이용을 원하시면 기한 내 로그인해 주세요.`;
  } else if (type === 'O') {
    sender = `order@${svc.domain}`;
    const item = svc.item[(n - 1) % svc.item.length];
    const no = `${ymd.replace(/-/g, '')}-${String(1000 + seq * 37).slice(-4)}`;
    const price = (12000 + (seq * 7919) % 80000).toLocaleString('ko-KR');
    subject = `[${svc.name}] 주문이 완료되었습니다 (주문번호 ${no})`;
    body = `김지우님, 주문해 주셔서 감사합니다.\n\n주문번호: ${no}\n상품: ${item}\n결제 금액: ${price}원\n결제 완료 일시: ${ymd}\n\n영수증은 마이페이지 > 주문내역에서 확인하실 수 있습니다.`;
  } else if (type === 'N') {
    sender = `letter@${svc.domain}`;
    subject = `[${svc.name}] ${NEWS[(n - 1) % NEWS.length]}`;
    body = `안녕하세요, ${svc.name}입니다.\n구독하신 뉴스레터를 보내드립니다.\n\n1. 주요 소식 요약\n2. 알아두면 좋은 생활 팁\n3. 이번 주 추천 읽을거리`;
  }

  const d = dates(ymd, seq);
  const headers = [
    `From ${sender} ${d.fromLine}`,
    `From: ${enc(svc.name)} <${sender}>`,
    `To: ${enc('김지우')} <jiwoo.kim@mail.example>`,
    `Subject: ${enc(subject)}`,
    `Date: ${d.header}`,
    `Message-ID: <${ymd.replace(/-/g, '')}.${seq}.${type}@${svc.domain}>`,
    ...extra,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  // mbox 규칙: 본문에서 "From "으로 시작하는 줄은 ">From "으로
  const safeBody = (body + footer).split('\n').map((l) => (/^>*From /.test(l) ? '>' + l : l)).join('\n');
  return { ymd, seq, sortKey: d.header.slice(-14, -6), text: headers.join('\n') + '\n\n' + safeBody + '\n' };
}

const mails = [];
let seq = 0;
for (const svc of SERVICES) {
  const counters = {};
  for (const ev of svc.events.split(',').map((s) => s.trim())) {
    const [type, ymd] = ev.split(' ');
    mails.push({ svc: svc.name, type, ...build(svc, type, ymd, ++seq, counters) });
  }
}
// 실제 메일함처럼 날짜순 정렬
mails.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.sortKey.localeCompare(b.sortKey));

const out = path.join(__dirname, '..', 'samples', 'demo.mbox');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, mails.map((m) => m.text).join('\n'), 'utf8');
console.log(`생성 완료: ${out} (${mails.length}통, 서비스 ${SERVICES.length}곳)`);
