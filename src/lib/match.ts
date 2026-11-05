import { SERVICES } from '../data/services';
import type { ServiceInfo } from '../types';

/** 비교용 정규화: 소문자 + 공백·기호 제거 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣+]/g, '');
}

const HAS_LATIN = /[a-z]/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 영어 별칭은 단어 경계로 매칭 (flo가 workflow에 걸리지 않게),
 * 한글 별칭은 공백을 무시한 부분 문자열로 매칭한다.
 */
export function containsAlias(text: string, alias: string): boolean {
  if (HAS_LATIN.test(alias)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias.toLowerCase())}($|[^a-z0-9])`);
    return re.test(text.toLowerCase());
  }
  return normalize(text).includes(normalize(alias));
}

export function matchByName(text: string, opts: { includePlatforms?: boolean } = {}): ServiceInfo | undefined {
  if (!text) return undefined;
  return SERVICES.find(
    (s) => (opts.includePlatforms || !s.platform) && s.aliases.some((a) => containsAlias(text, a)),
  );
}

export function matchByDomain(addr: string): ServiceInfo | undefined {
  const domain = addr.split('@')[1]?.toLowerCase();
  if (!domain) return undefined;
  return SERVICES.find((s) => s.domains.some((d) => domain === d || domain.endsWith('.' + d)));
}

/** 이름이 정확히 같은 서비스 (연결된 서비스 목록용) */
export function matchExact(name: string): ServiceInfo | undefined {
  const n = normalize(name);
  return (
    SERVICES.find((s) => s.aliases.some((a) => normalize(a) === n) || normalize(s.name) === n) ??
    matchByName(name, { includePlatforms: false })
  );
}
