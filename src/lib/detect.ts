/**
 * 메일 한 통 → 구독 신호(MailHit). 규칙 기반이라 발표 때 "왜 이렇게 판단했는지" 설명하기 쉽다.
 */
import type { HitKind, MailHit, Money, ServiceInfo } from '../types';
import { decodeBody, displayName, parseHeadersOnly } from './mime';
import { matchByDomain, matchByName } from './match';

const CANCEL = /해지|구독\s?취소|멤버십\s?취소|cancel(l)?ed|cancellation/i;
const TRIAL = /무료\s?체험|체험\s?기간|free\s?trial|trial/i;
const RENEW = /정기\s?결제|자동\s?결제|갱신|구독|멤버십|이용권|renew|subscription|recurring|membership|your plan/i;
const PAY = /결제|영수증|청구|구매|주문|receipt|invoice|payment|billing|charged|order/i;
const SIGNUP = /가입|환영|welcome/i;
const AD = /^\s*[([]?\s*광고\s*[)\]]/;

export function classify(subject: string): HitKind | null {
  if (CANCEL.test(subject)) return 'cancel';
  if (TRIAL.test(subject)) return 'trial';
  if (RENEW.test(subject)) return 'renewal';
  if (PAY.test(subject)) return 'payment';
  if (SIGNUP.test(subject)) return 'signup';
  return null;
}

const AMOUNT_RE =
  /(₩|KRW)\s?([0-9][0-9,]*(?:\.\d+)?)|([0-9][0-9,]*)\s?원|(US\$|USD|\$)\s?([0-9][0-9,]*(?:\.\d{1,2})?)|([0-9][0-9,]*(?:\.\d{1,2})?)\s?(?:USD|달러)/g;
const TOTAL_HINT = /합계|총\s?(결제|금액)|결제\s?금액|청구\s?금액|이용\s?금액|total|amount|charged/i;

/** 본문에서 결제 금액을 하나 고른다. "합계/결제금액" 근처 금액을 우선. */
export function extractAmount(text: string): Money | undefined {
  let best: { money: Money; score: number } | undefined;
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(AMOUNT_RE)) {
      const krw = m[2] ?? m[3];
      const usd = m[5] ?? m[6];
      const raw = (krw ?? usd ?? '').replace(/,/g, '');
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const money: Money = krw ? { value, currency: 'KRW' } : { value, currency: 'USD' };
      if (money.currency === 'KRW' && (value < 100 || value > 5_000_000)) continue;
      if (money.currency === 'USD' && (value < 0.5 || value > 5_000)) continue;
      const score = TOTAL_HINT.test(line) ? 2 : 1;
      if (!best || score > best.score) best = { money, score };
    }
  }
  return best?.money;
}

function pickService(subject: string, fromName: string, fromAddr: string, body: () => string): ServiceInfo | undefined {
  const byName = matchByName(`${subject} ${fromName}`);
  if (byName) return byName;
  const byDomain = matchByDomain(fromAddr);
  if (byDomain?.platform) {
    // Google Play / App Store 영수증: 본문에서 실제 서비스 이름을 찾아본다
    return matchByName(body().slice(0, 4000)) ?? byDomain;
  }
  return byDomain ?? matchByName(`${subject} ${fromName}`, { includePlatforms: true });
}

/** 메일 원문(바이너리 문자열) 한 통을 분석. 구독과 무관하면 null. */
export function detectFromRaw(raw: string): MailHit | null {
  const info = parseHeadersOnly(raw);
  let bodyCache: string | undefined;
  const body = () => (bodyCache ??= decodeBody(info));
  const fromName = displayName(info.from);
  const kind = classify(info.subject);
  const service = pickService(info.subject, fromName, info.fromAddr, body);

  if (AD.test(info.subject) && kind !== 'payment' && kind !== 'renewal') return null;
  // 사전에 없는 발신자는 "구독/정기결제/체험/해지" 메일만 인정 (일반 쇼핑 주문은 구독이 아님)
  if (!service && kind !== 'renewal' && kind !== 'trial' && kind !== 'cancel') return null;

  const finalKind: HitKind = kind ?? 'account';
  const needsAmount = finalKind === 'payment' || finalKind === 'renewal' || finalKind === 'trial';
  return {
    serviceId: service?.id,
    name: service?.name ?? fromName,
    kind: finalKind,
    date: info.date,
    amount: needsAmount ? extractAmount(`${info.subject}\n${body()}`) : undefined,
    subject: info.subject,
    fromAddr: info.fromAddr,
  };
}

/**
 * 메일함 목록을 그대로 복사해서 붙여넣은 경우 (헤더 없는 일반 텍스트).
 * 한 줄 = 메일 한 통으로 보고, 줄 안에서 서비스·금액·날짜를 찾는다.
 */
export function detectFromLine(line: string): MailHit | null {
  const text = line.trim();
  if (text.length < 4) return null;
  const kind = classify(text);
  const service = matchByName(text, { includePlatforms: true });
  if (!service && (kind === null || kind === 'signup')) return null;
  if (!service) return null; // 목록 붙여넣기는 발신자를 모르니 사전에 있는 서비스만
  const dm = /(20\d{2})[.\-/년]\s?(\d{1,2})[.\-/월]\s?(\d{1,2})/.exec(text);
  return {
    serviceId: service.id,
    name: service.name,
    kind: kind ?? 'account',
    date: dm ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) : null,
    amount: extractAmount(text),
    subject: text.slice(0, 120),
    fromAddr: '',
  };
}

/** 붙여넣은 텍스트가 메일 원문(헤더 포함)인지 */
export function looksLikeRawMail(text: string): boolean {
  return /^(From|Subject|Date|Received|Return-Path):/im.test(text) && /^Subject:/im.test(text);
}
