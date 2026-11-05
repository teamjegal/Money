import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzePastedText } from './analyzeMail';
import { classify, extractAmount } from './detect';
import { buildFindings, summarize } from './findings';
import { containsAlias } from './match';
import { splitMbox } from './mbox';
import { bytesToBinary } from './mime';
import { detectFromRaw } from './detect';

const samples = join(__dirname, '../../public/samples');

describe('extractAmount', () => {
  it('원화', () => expect(extractAmount('결제금액: 7,890원')).toEqual({ value: 7890, currency: 'KRW' }));
  it('₩ 기호', () => expect(extractAmount('합계: ₩14,900')).toEqual({ value: 14900, currency: 'KRW' }));
  it('달러', () => expect(extractAmount('Amount paid $20.00')).toEqual({ value: 20, currency: 'USD' }));
  it('합계 줄 우선', () =>
    expect(extractAmount('할인 3,000원\n총 결제금액 9,900원')).toEqual({ value: 9900, currency: 'KRW' }));
  it('너무 작은 숫자는 무시', () => expect(extractAmount('1원 이벤트')).toBeUndefined());
});

describe('classify', () => {
  it('해지가 가장 우선', () => expect(classify('구독 해지가 완료되었습니다')).toBe('cancel'));
  it('무료체험', () => expect(classify('무료 체험이 시작되었습니다')).toBe('trial'));
  it('정기결제', () => expect(classify('와우 멤버십 정기결제 안내')).toBe('renewal'));
  it('영수증', () => expect(classify('Your receipt from OpenAI')).toBe('payment'));
});

describe('containsAlias', () => {
  it('영어 별칭은 단어 단위', () => {
    expect(containsAlias('FLO 이용권 결제', 'flo')).toBe(true);
    expect(containsAlias('new workflow', 'flo')).toBe(false);
  });
  it('한글 별칭은 띄어쓰기 무시', () => expect(containsAlias('밀리의 서재', '밀리의서재')).toBe(true));
});

describe('샘플 mbox 전체 흐름', () => {
  const raw = bytesToBinary(readFileSync(join(samples, 'sample.mbox')));
  const messages = splitMbox(raw);
  const hits = messages.map(detectFromRaw).filter((h) => h !== null);
  const findings = buildFindings(hits, []);
  const byId = (id: string) => findings.find((f) => f.service?.id === id);

  it('메일 10통으로 나뉜다', () => expect(messages).toHaveLength(10));

  it('넷플릭스: 매월 13,500원 결제 중', () => {
    const f = byId('netflix')!;
    expect(f.status).toBe('paid');
    expect(f.cadence).toBe('monthly');
    expect(f.monthlyKRW).toBe(13500);
  });

  it('Google Play 영수증 안의 YouTube Premium을 찾는다', () => {
    expect(byId('youtube-premium')?.lastCharge?.value).toBe(14900);
  });

  it('ChatGPT는 달러 → 원화 추정', () => {
    const f = byId('chatgpt')!;
    expect(f.lastCharge).toMatchObject({ value: 20, currency: 'USD' });
    expect(f.estimated).toBe(true);
  });

  it('Spotify 무료체험, 왓챠 해지', () => {
    expect(byId('spotify')?.status).toBe('trial');
    expect(byId('watcha')?.status).toBe('canceled');
  });

  it('사전에 없는 정기구독도 잡는다', () => {
    expect(findings.find((f) => f.name.includes('핏데일리'))?.monthlyKRW).toBe(9900);
  });

  it('광고 메일과 일반 쇼핑 주문은 제외', () => {
    expect(hits.some((h) => h.fromAddr.endsWith('shop.example'))).toBe(false);
  });

  it('요약', () => {
    const s = summarize(findings);
    expect(s.paidCount).toBe(5); // 넷플릭스, 유튜브, ChatGPT, 쿠팡, 핏데일리
  });
});

describe('붙여넣기', () => {
  it('메일함 목록 한 줄씩', () => {
    const r = analyzePastedText('넷플릭스  결제가 완료되었습니다 ₩13,500  2026.10.03\n친구가 보낸 메일\nYouTube Premium 멤버십 갱신 14,900원');
    expect(r.hits.map((h) => h.serviceId)).toEqual(['netflix', 'youtube-premium']);
    expect(r.hits[0].date?.getMonth()).toBe(9);
  });

  it('메일 원문 붙여넣기', () => {
    const r = analyzePastedText('From: Spotify <no-reply@spotify.com>\nSubject: Your Spotify receipt\n\nTotal 11,990원');
    expect(r.hits[0]).toMatchObject({ serviceId: 'spotify', kind: 'payment', amount: { value: 11990 } });
  });
});
