/**
 * 카카오 "연결된 서비스 관리" / 네이버 "연결된 서비스 관리" 화면을
 * 통째로 복사해서 붙여넣은 텍스트를 서비스 목록으로 바꾼다.
 * 화면 문구(버튼, 섹션 제목)는 버리고 서비스 이름과 날짜만 남긴다.
 */
import type { ConnectedEntry } from '../types';
import { matchExact, normalize } from './match';

const NOISE = new RegExp(
  '^(' +
    [
      '연결된\\s?서비스(\\s?관리)?',
      '카카오\\s?서비스',
      'for\\s?kakao.*',
      '.*제휴\\s?서비스',
      '외부\\s?서비스',
      '전체\\s?보기',
      '연결\\s?끊기',
      '모든\\s?정보\\s?삭제',
      '서비스\\s?동의\\s?철회',
      '네이버\\s?(로그인|인증서)',
      '채널링.*',
      '연결\\s?계정\\s?관리',
      '이력\\s?관리',
      '카카오\\s?계정',
      '네이버\\s?id',
      '더보기|확인|닫기|설정|검색|이전|다음|편집',
      '최근\\s?(이용|접속).*',
      '(최초\\s?)?연결일.*',
    ].join('|') +
    ')$',
  'i',
);

const DATE = /(20\d{2})\s?[.\-/년]\s?(\d{1,2})\s?[.\-/월]\s?(\d{1,2})/;

function toDate(m: RegExpExecArray): Date {
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function parseConnectedText(text: string, source: 'kakao' | 'naver'): ConnectedEntry[] {
  const entries: ConnectedEntry[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[>›❯•·]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const dm = DATE.exec(line);
    const withoutDate = dm ? line.replace(dm[0], '').replace(/[(){}[\]:,]/g, ' ').trim() : line;

    // 날짜만 있는 줄 → 바로 위 서비스의 날짜
    if (dm && (withoutDate === '' || NOISE.test(withoutDate) || /연결|이용|동의|접속/.test(withoutDate))) {
      const prev = entries[entries.length - 1];
      if (prev && !prev.date) prev.date = toDate(dm);
      continue;
    }

    const name = withoutDate.replace(/\s?\d+$/, '').trim(); // "외부 서비스 23" 같은 개수 표시 제거
    if (!name || name.length > 40 || NOISE.test(name) || /^\d+$/.test(name)) continue;

    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const service = matchExact(name);
    entries.push({ name, source, date: dm ? toDate(dm) : undefined, serviceId: service?.id });
  }
  return entries;
}
