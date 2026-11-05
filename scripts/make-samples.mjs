// 데모·테스트용 가짜 데이터를 public/samples/ 에 만든다. (실제 개인 메일은 절대 넣지 말 것)
// 실행: npm run samples
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');
mkdirSync(out, { recursive: true });

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const subj = (s) => `=?UTF-8?B?${b64(s)}?=`;
const qp = (s) =>
  [...Buffer.from(s, 'utf8')]
    .map((b) => (b >= 33 && b <= 126 && b !== 61 ? String.fromCharCode(b) : b === 10 ? '\n' : '=' + b.toString(16).toUpperCase().padStart(2, '0')))
    .join('');

function mail({ from, subject, date, body, html = false, encoding = 'base64' }) {
  const type = html ? 'text/html' : 'text/plain';
  const encoded = encoding === 'base64' ? b64(body).replace(/(.{76})/g, '$1\n') : qp(body);
  return [
    `From sender@example.com ${new Date(date).toUTCString()}`,
    `From: ${from}`,
    `To: me@example.com`,
    `Subject: ${subj(subject)}`,
    `Date: ${new Date(date).toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${type}; charset="UTF-8"`,
    `Content-Transfer-Encoding: ${encoding}`,
    ``,
    encoded,
    ``,
  ].join('\n');
}

function multipart({ from, subject, date, text, html }) {
  const boundary = 'b0undary_' + Math.random().toString(36).slice(2);
  return [
    `From sender@example.com ${new Date(date).toUTCString()}`,
    `From: ${from}`,
    `To: me@example.com`,
    `Subject: ${subject}`,
    `Date: ${new Date(date).toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64(text),
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64(html),
    `--${boundary}--`,
    ``,
  ].join('\n');
}

const messages = [
  mail({
    from: `"Netflix" <info@account.netflix.com>`,
    subject: '넷플릭스 결제가 완료되었습니다',
    date: '2026-09-03T09:00:00+09:00',
    html: true,
    body: '<html><body><p>안녕하세요, 회원님</p><table><tr><td>멤버십</td><td>스탠다드</td></tr><tr><td>결제 금액</td><td>₩13,500</td></tr></table></body></html>',
  }),
  mail({
    from: `"Netflix" <info@account.netflix.com>`,
    subject: '넷플릭스 결제가 완료되었습니다',
    date: '2026-10-03T09:00:00+09:00',
    html: true,
    body: '<html><body><p>안녕하세요, 회원님</p><table><tr><td>결제 금액</td><td>₩13,500</td></tr></table></body></html>',
  }),
  mail({
    from: `Google Play <googleplay-noreply@google.com>`,
    subject: 'Google Play 주문 영수증 (2026년 10월 15일)',
    date: '2026-10-15T12:30:00+09:00',
    encoding: 'quoted-printable',
    body: 'Google Play에서 구매해 주셔서 감사합니다.\n\n항목: YouTube Premium (월간)\n자동 갱신: 매월\n합계: ₩14,900\n',
  }),
  multipart({
    from: `OpenAI <noreply@tm.openai.com>`,
    subject: 'Your receipt from OpenAI #2931-0042',
    date: '2026-10-20T03:10:00Z',
    text: 'ChatGPT Plus Subscription\nAmount paid $20.00\nThanks for your business.',
    html: '<p>ChatGPT Plus Subscription</p><p>Amount paid <b>$20.00</b></p>',
  }),
  mail({
    from: `Spotify <no-reply@spotify.com>`,
    subject: 'Spotify Premium 무료 체험이 시작되었습니다',
    date: '2026-10-28T20:00:00+09:00',
    body: '1개월 무료 체험이 시작되었어요. 체험 종료 후 매월 11,990원이 결제됩니다.',
  }),
  mail({
    from: `쿠팡 <noreply@coupang.com>`,
    subject: '와우 멤버십 정기결제 안내',
    date: '2026-10-11T08:00:00+09:00',
    body: '와우 멤버십 월회비가 정상 결제되었습니다.\n결제금액: 7,890원',
  }),
  mail({
    from: `왓챠 <help@watcha.com>`,
    subject: '왓챠 구독 해지가 완료되었습니다',
    date: '2026-08-01T10:00:00+09:00',
    body: '구독 해지가 완료되었습니다. 이용해주셔서 감사합니다.',
  }),
  mail({
    from: `핏데일리 <billing@fitdaily.example>`,
    subject: '핏데일리 프리미엄 정기구독 결제 안내',
    date: '2026-10-05T07:00:00+09:00',
    body: '이번 달 정기구독 결제가 완료되었습니다.\n총 결제금액 9,900원',
  }),
  // 아래 두 통은 구독이 아니라서 결과에 나오면 안 된다
  mail({
    from: `어떤쇼핑몰 <ad@shop.example>`,
    subject: '(광고) 가을 맞이 최대 70% 할인',
    date: '2026-10-10T10:00:00+09:00',
    body: '지금 바로 확인하세요!',
  }),
  mail({
    from: `어떤쇼핑몰 <order@shop.example>`,
    subject: '주문하신 상품이 결제되었습니다',
    date: '2026-10-12T10:00:00+09:00',
    body: '결제금액 32,000원',
  }),
];

writeFileSync(join(out, 'sample.mbox'), messages.join('\n'));

writeFileSync(
  join(out, 'kakao.txt'),
  `연결된 서비스 관리
카카오 서비스 3
멜론
2023.04.12 연결
카카오맵
for Kakao 제휴 서비스 2
카카오페이지
외부 서비스 6
밀리의 서재
최근 이용 2024.01.03
요기요
연결 끊기
쏘카
야놀자
티빙
2022.07.19
전체보기
`,
);

writeFileSync(
  join(out, 'naver.txt'),
  `네이버 로그인
웨이브
2022.11.30
윌라
라프텔
무신사
배달의민족
서비스 동의 철회
`,
);

console.log('samples written to', out);
