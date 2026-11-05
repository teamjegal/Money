export type Source = 'mail' | 'kakao' | 'naver';

export type Category =
  | 'ott'
  | 'music'
  | 'shopping'
  | 'delivery'
  | 'ai'
  | 'productivity'
  | 'cloud'
  | 'reading'
  | 'platform'
  | 'etc';

export interface Money {
  value: number;
  currency: 'KRW' | 'USD';
}

/** 서비스 사전 항목 (src/data/services.ts) */
export interface ServiceInfo {
  id: string;
  name: string;
  /** 메일 제목·연결 서비스 목록에서 찾을 이름들 (대소문자·공백 무시) */
  aliases: string[];
  /** 발신 메일 도메인 (하위 도메인 포함 매칭) */
  domains: string[];
  category: Category;
  /** 유료 구독 상품이 있는 서비스인지 */
  paid: boolean;
  /** 참고용 월 요금 (실제와 다를 수 있음) */
  refPrice?: Money;
  /** 해지/구독 관리 페이지 */
  manageUrl?: string;
  /** Google Play, App Store처럼 여러 구독을 대신 결제하는 플랫폼 */
  platform?: boolean;
}

export interface MailMessage {
  from: string;
  fromAddr: string;
  subject: string;
  date: Date | null;
  body: string;
}

export type HitKind = 'payment' | 'renewal' | 'trial' | 'cancel' | 'signup' | 'account';

/** 메일 한 통에서 찾은 구독 신호 */
export interface MailHit {
  serviceId?: string;
  name: string;
  kind: HitKind;
  date: Date | null;
  amount?: Money;
  subject: string;
  fromAddr: string;
}

/** 카카오/네이버 연결된 서비스 목록의 한 줄 */
export interface ConnectedEntry {
  name: string;
  source: 'kakao' | 'naver';
  date?: Date;
  serviceId?: string;
}

export type FindingStatus = 'paid' | 'trial' | 'maybe-paid' | 'canceled' | 'account-only';

/** 결과 화면에 보여줄 서비스 1개 */
export interface Finding {
  key: string;
  name: string;
  service?: ServiceInfo;
  sources: Source[];
  status: FindingStatus;
  hits: MailHit[];
  connected: ConnectedEntry[];
  lastCharge?: Money & { date: Date | null };
  cadence?: 'monthly' | 'yearly';
  /** 월 환산 원화 금액 */
  monthlyKRW?: number;
  /** monthlyKRW가 메일 금액이 아니라 참고가로 추정한 값인지 */
  estimated: boolean;
}
