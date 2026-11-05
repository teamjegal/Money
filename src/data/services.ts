import type { ServiceInfo } from '../types';

/**
 * 서비스 사전. 새 서비스는 여기에 한 줄 추가하면 메일·연결 서비스 매칭에 모두 반영된다.
 *
 * - 더 구체적인 이름을 먼저 둔다 (예: 쿠팡플레이 → 쿠팡 와우 순서). 위에서부터 첫 매칭을 쓴다.
 * - refPrice는 발표·추정용 참고가다. 정확한 값이 아니니 화면에도 "추정"으로 표시한다.
 * - manageUrl은 대회 전에 팀원이 한 번씩 눌러서 열리는지 확인할 것.
 */
export const SERVICES: ServiceInfo[] = [
  // OTT
  { id: 'netflix', name: '넷플릭스', aliases: ['netflix', '넷플릭스'], domains: ['netflix.com'], category: 'ott', paid: true, refPrice: { value: 13500, currency: 'KRW' }, manageUrl: 'https://www.netflix.com/cancelplan' },
  { id: 'youtube-premium', name: 'YouTube Premium', aliases: ['youtube premium', '유튜브 프리미엄', 'youtube music premium'], domains: ['youtube.com'], category: 'ott', paid: true, refPrice: { value: 14900, currency: 'KRW' }, manageUrl: 'https://www.youtube.com/paid_memberships' },
  { id: 'disney-plus', name: '디즈니+', aliases: ['disney+', 'disney plus', '디즈니플러스', '디즈니+'], domains: ['disneyplus.com'], category: 'ott', paid: true, refPrice: { value: 9900, currency: 'KRW' }, manageUrl: 'https://www.disneyplus.com/account' },
  { id: 'tving', name: '티빙', aliases: ['tving', '티빙'], domains: ['tving.com'], category: 'ott', paid: true, refPrice: { value: 9500, currency: 'KRW' }, manageUrl: 'https://www.tving.com' },
  { id: 'wavve', name: '웨이브', aliases: ['wavve', '웨이브'], domains: ['wavve.com'], category: 'ott', paid: true, refPrice: { value: 7900, currency: 'KRW' }, manageUrl: 'https://www.wavve.com' },
  { id: 'watcha', name: '왓챠', aliases: ['watcha', '왓챠'], domains: ['watcha.com', 'watcha.co.kr'], category: 'ott', paid: true, refPrice: { value: 7900, currency: 'KRW' }, manageUrl: 'https://watcha.com' },
  { id: 'coupang-play', name: '쿠팡플레이', aliases: ['coupang play', '쿠팡플레이'], domains: ['coupangplay.com'], category: 'ott', paid: false, manageUrl: 'https://www.coupangplay.com' },
  { id: 'laftel', name: '라프텔', aliases: ['laftel', '라프텔'], domains: ['laftel.net'], category: 'ott', paid: true, refPrice: { value: 9900, currency: 'KRW' }, manageUrl: 'https://laftel.net' },

  // 쇼핑·배달 멤버십
  { id: 'coupang-wow', name: '쿠팡 와우', aliases: ['와우 멤버십', 'wow 멤버십', '로켓와우', '쿠팡 와우', '쿠팡'], domains: ['coupang.com'], category: 'shopping', paid: true, refPrice: { value: 7890, currency: 'KRW' }, manageUrl: 'https://www.coupang.com' },
  { id: 'naver-plus', name: '네이버플러스 멤버십', aliases: ['네이버플러스', '네이버 플러스 멤버십', 'naver plus'], domains: [], category: 'shopping', paid: true, refPrice: { value: 4900, currency: 'KRW' }, manageUrl: 'https://nid.naver.com/membership/my' },
  { id: 'baemin-club', name: '배민클럽', aliases: ['배민클럽', '배달의민족', '배민'], domains: ['baemin.com', 'woowahan.com'], category: 'delivery', paid: true, refPrice: { value: 3990, currency: 'KRW' }, manageUrl: 'https://www.baemin.com' },
  { id: 'yogiyo', name: '요기요 요기패스', aliases: ['요기패스', '요기요', 'yogiyo'], domains: ['yogiyo.co.kr'], category: 'delivery', paid: true, refPrice: { value: 4900, currency: 'KRW' }, manageUrl: 'https://www.yogiyo.co.kr' },
  { id: 'kurly', name: '컬리멤버스', aliases: ['컬리멤버스', '마켓컬리', '컬리', 'kurly'], domains: ['kurly.com'], category: 'shopping', paid: true, refPrice: { value: 1900, currency: 'KRW' }, manageUrl: 'https://www.kurly.com' },

  // 음악
  { id: 'spotify', name: 'Spotify', aliases: ['spotify', '스포티파이'], domains: ['spotify.com'], category: 'music', paid: true, refPrice: { value: 11990, currency: 'KRW' }, manageUrl: 'https://www.spotify.com/account/subscription/' },
  { id: 'melon', name: '멜론', aliases: ['melon', '멜론'], domains: ['melon.com', 'kakaoent.com'], category: 'music', paid: true, refPrice: { value: 10900, currency: 'KRW' }, manageUrl: 'https://www.melon.com' },
  { id: 'genie', name: '지니뮤직', aliases: ['genie', '지니뮤직', '지니'], domains: ['genie.co.kr'], category: 'music', paid: true, refPrice: { value: 8400, currency: 'KRW' }, manageUrl: 'https://www.genie.co.kr' },
  { id: 'flo', name: 'FLO', aliases: ['flo', '플로'], domains: ['music-flo.com', 'dreamus.io'], category: 'music', paid: true, refPrice: { value: 7590, currency: 'KRW' }, manageUrl: 'https://www.music-flo.com' },
  { id: 'vibe', name: 'VIBE', aliases: ['vibe', '바이브'], domains: [], category: 'music', paid: true, refPrice: { value: 8500, currency: 'KRW' }, manageUrl: 'https://vibe.naver.com' },

  // 독서
  { id: 'millie', name: '밀리의 서재', aliases: ['밀리의 서재', '밀리의서재', 'millie'], domains: ['millie.co.kr'], category: 'reading', paid: true, refPrice: { value: 9900, currency: 'KRW' }, manageUrl: 'https://www.millie.co.kr' },
  { id: 'ridi', name: '리디', aliases: ['리디셀렉트', '리디북스', '리디', 'ridi'], domains: ['ridi.com', 'ridibooks.com'], category: 'reading', paid: true, refPrice: { value: 4900, currency: 'KRW' }, manageUrl: 'https://ridibooks.com' },
  { id: 'welaaa', name: '윌라', aliases: ['윌라', 'welaaa'], domains: ['welaaa.com'], category: 'reading', paid: true, refPrice: { value: 9900, currency: 'KRW' }, manageUrl: 'https://www.welaaa.com' },

  // AI·생산성
  { id: 'chatgpt', name: 'ChatGPT Plus', aliases: ['chatgpt', 'openai'], domains: ['openai.com', 'chatgpt.com'], category: 'ai', paid: true, refPrice: { value: 20, currency: 'USD' }, manageUrl: 'https://chatgpt.com/#settings/Account' },
  { id: 'claude', name: 'Claude Pro', aliases: ['claude', 'anthropic'], domains: ['anthropic.com', 'claude.ai', 'claude.com'], category: 'ai', paid: true, refPrice: { value: 20, currency: 'USD' }, manageUrl: 'https://claude.ai/settings/billing' },
  { id: 'gemini', name: 'Google AI Pro', aliases: ['google ai pro', 'gemini advanced', 'google one ai'], domains: [], category: 'ai', paid: true, refPrice: { value: 29000, currency: 'KRW' }, manageUrl: 'https://one.google.com' },
  { id: 'cursor', name: 'Cursor', aliases: ['cursor'], domains: ['cursor.com', 'cursor.sh'], category: 'ai', paid: true, refPrice: { value: 20, currency: 'USD' }, manageUrl: 'https://cursor.com/settings' },
  { id: 'github', name: 'GitHub', aliases: ['github copilot', 'github'], domains: ['github.com'], category: 'productivity', paid: true, refPrice: { value: 10, currency: 'USD' }, manageUrl: 'https://github.com/settings/billing' },
  { id: 'notion', name: 'Notion', aliases: ['notion', '노션'], domains: ['notion.so', 'makenotion.com'], category: 'productivity', paid: true, refPrice: { value: 10, currency: 'USD' }, manageUrl: 'https://www.notion.so' },
  { id: 'ms365', name: 'Microsoft 365', aliases: ['microsoft 365', 'office 365', '마이크로소프트 365'], domains: ['microsoft.com'], category: 'productivity', paid: true, refPrice: { value: 8900, currency: 'KRW' }, manageUrl: 'https://account.microsoft.com/services' },
  { id: 'adobe', name: 'Adobe', aliases: ['adobe', 'creative cloud', '어도비'], domains: ['adobe.com'], category: 'productivity', paid: true, refPrice: { value: 11000, currency: 'KRW' }, manageUrl: 'https://account.adobe.com/plans' },
  { id: 'canva', name: 'Canva', aliases: ['canva', '캔바'], domains: ['canva.com'], category: 'productivity', paid: true, refPrice: { value: 14000, currency: 'KRW' }, manageUrl: 'https://www.canva.com/settings/billing-and-plans' },
  { id: 'duolingo', name: '듀오링고', aliases: ['duolingo', '듀오링고'], domains: ['duolingo.com'], category: 'productivity', paid: true, refPrice: { value: 9900, currency: 'KRW' }, manageUrl: 'https://www.duolingo.com/settings/subscription' },

  // 클라우드
  { id: 'google-one', name: 'Google One', aliases: ['google one', '구글 원'], domains: [], category: 'cloud', paid: true, refPrice: { value: 2400, currency: 'KRW' }, manageUrl: 'https://one.google.com' },
  { id: 'icloud', name: 'iCloud+', aliases: ['icloud+', 'icloud'], domains: [], category: 'cloud', paid: true, refPrice: { value: 1100, currency: 'KRW' }, manageUrl: 'https://apps.apple.com/account/subscriptions' },

  // 플랫폼 (여러 구독을 대신 결제) — 반드시 맨 아래
  { id: 'google-play', name: 'Google Play 구독', aliases: ['google play', '구글 플레이'], domains: ['google.com'], category: 'platform', paid: true, manageUrl: 'https://play.google.com/store/account/subscriptions', platform: true },
  { id: 'app-store', name: 'App Store 구독', aliases: ['app store', 'apple'], domains: ['apple.com', 'email.apple.com'], category: 'platform', paid: true, manageUrl: 'https://apps.apple.com/account/subscriptions', platform: true },
];

export const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

export const CATEGORY_LABEL: Record<ServiceInfo['category'], string> = {
  ott: 'OTT',
  music: '음악',
  shopping: '쇼핑',
  delivery: '배달',
  ai: 'AI',
  productivity: '생산성',
  cloud: '클라우드',
  reading: '독서',
  platform: '앱마켓',
  etc: '기타',
};

/** 대략적인 환율. 화면에는 "추정"으로 표시한다. */
export const USD_KRW = 1400;
