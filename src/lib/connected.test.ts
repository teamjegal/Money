import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConnectedText } from './connected';

const samples = join(__dirname, '../../public/samples');

describe('parseConnectedText', () => {
  it('카카오 화면 복사본에서 서비스 이름만 남긴다', () => {
    const entries = parseConnectedText(readFileSync(join(samples, 'kakao.txt'), 'utf8'), 'kakao');
    expect(entries.map((e) => e.name)).toEqual(['멜론', '카카오맵', '카카오페이지', '밀리의 서재', '요기요', '쏘카', '야놀자', '티빙']);
  });

  it('바로 아래 날짜 줄을 서비스에 붙인다', () => {
    const entries = parseConnectedText('멜론\n2023.04.12 연결\n티빙', 'kakao');
    expect(entries[0].date?.getFullYear()).toBe(2023);
    expect(entries[1].date).toBeUndefined();
  });

  it('사전에 있는 유료 서비스는 serviceId가 붙는다', () => {
    const entries = parseConnectedText(readFileSync(join(samples, 'naver.txt'), 'utf8'), 'naver');
    const ids = Object.fromEntries(entries.map((e) => [e.name, e.serviceId]));
    expect(ids['웨이브']).toBe('wavve');
    expect(ids['배달의민족']).toBe('baemin-club');
    expect(ids['무신사']).toBeUndefined();
  });

  it('중복 제거', () => {
    expect(parseConnectedText('티빙\n티빙\n 티빙 ', 'kakao')).toHaveLength(1);
  });
});
