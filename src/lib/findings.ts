/**
 * 메일 신호 + 연결된 서비스 → 서비스별 결과(Finding).
 */
import { SERVICE_BY_ID, USD_KRW } from '../data/services';
import type { ConnectedEntry, Finding, FindingStatus, MailHit, Money, Source } from '../types';
import { normalize } from './match';

export function toKRW(m: Money): number {
  return Math.round(m.currency === 'KRW' ? m.value : m.value * USD_KRW);
}

const DAY = 86_400_000;

/** 결제일 간격으로 월/연 결제를 추정 */
export function detectCadence(dates: Date[]): 'monthly' | 'yearly' | undefined {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps = sorted.slice(1).map((d, i) => (d.getTime() - sorted[i].getTime()) / DAY);
  if (gaps.some((g) => g >= 25 && g <= 35)) return 'monthly';
  if (gaps.some((g) => g >= 350 && g <= 380)) return 'yearly';
  return undefined;
}

const STATUS_ORDER: FindingStatus[] = ['paid', 'trial', 'maybe-paid', 'account-only', 'canceled'];

export function buildFindings(hits: MailHit[], connected: ConnectedEntry[]): Finding[] {
  const groups = new Map<string, Finding>();

  const get = (serviceId: string | undefined, name: string): Finding => {
    const key = serviceId ?? 'x:' + normalize(name);
    let f = groups.get(key);
    if (!f) {
      const service = serviceId ? SERVICE_BY_ID.get(serviceId) : undefined;
      f = { key, name: service?.name ?? name, service, sources: [], status: 'account-only', hits: [], connected: [], estimated: false };
      groups.set(key, f);
    }
    return f;
  };
  const addSource = (f: Finding, s: Source) => {
    if (!f.sources.includes(s)) f.sources.push(s);
  };

  for (const h of hits) {
    const f = get(h.serviceId, h.name);
    f.hits.push(h);
    addSource(f, 'mail');
  }
  for (const c of connected) {
    const f = get(c.serviceId, c.name);
    f.connected.push(c);
    addSource(f, c.source);
  }

  for (const f of groups.values()) {
    const time = (d: Date | null) => d?.getTime() ?? 0;
    const payments = f.hits.filter((h) => h.kind === 'payment' || h.kind === 'renewal');
    const lastPaid = Math.max(0, ...payments.map((h) => time(h.date)));
    const lastCancel = Math.max(0, ...f.hits.filter((h) => h.kind === 'cancel').map((h) => time(h.date)));
    const withAmount = payments.filter((h) => h.amount).sort((a, b) => time(b.date) - time(a.date));

    if (withAmount[0]) f.lastCharge = { ...withAmount[0].amount!, date: withAmount[0].date };
    f.cadence = detectCadence(payments.map((h) => h.date).filter((d): d is Date => !!d));

    if (lastCancel && lastCancel >= lastPaid) f.status = 'canceled';
    else if (payments.length) f.status = 'paid';
    else if (f.hits.some((h) => h.kind === 'trial')) f.status = 'trial';
    else if (f.service?.paid && !f.service.platform) f.status = 'maybe-paid';
    else f.status = 'account-only';

    if (f.status === 'paid' && f.lastCharge) {
      f.monthlyKRW = Math.round(toKRW(f.lastCharge) / (f.cadence === 'yearly' ? 12 : 1));
      f.estimated = f.lastCharge.currency === 'USD';
    } else if ((f.status === 'paid' || f.status === 'maybe-paid' || f.status === 'trial') && f.service?.refPrice) {
      f.monthlyKRW = toKRW(f.service.refPrice);
      f.estimated = true;
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      (b.monthlyKRW ?? 0) - (a.monthlyKRW ?? 0) ||
      a.name.localeCompare(b.name, 'ko'),
  );
}

export interface Summary {
  total: number;
  paidCount: number;
  /** 메일로 결제가 확인된 월 지출 */
  confirmedMonthly: number;
  /** 유료일 가능성이 있는 서비스의 참고가 합 */
  possibleMonthly: number;
}

export function summarize(findings: Finding[]): Summary {
  let confirmedMonthly = 0;
  let possibleMonthly = 0;
  let paidCount = 0;
  for (const f of findings) {
    if (f.status === 'paid') {
      paidCount++;
      confirmedMonthly += f.monthlyKRW ?? 0;
    } else if (f.status === 'maybe-paid' || f.status === 'trial') {
      possibleMonthly += f.monthlyKRW ?? 0;
    }
  }
  return { total: findings.length, paidCount, confirmedMonthly, possibleMonthly };
}
