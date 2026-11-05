import { describe, expect, it } from 'vitest';
import { decodeHeaderValue, parseMessage, stripHtml, textToBinary } from './mime';

describe('decodeHeaderValue', () => {
  it('UTF-8 base64 인코딩 제목', () => {
    expect(decodeHeaderValue('=?UTF-8?B?7ZWc6riA?=')).toBe('한글');
  });
  it('EUC-KR base64 인코딩 제목', () => {
    expect(decodeHeaderValue('=?euc-kr?B?x9Gx2w==?=')).toBe('한글');
  });
  it('ks_c_5601-1987 별칭', () => {
    expect(decodeHeaderValue('=?ks_c_5601-1987?B?x9Gx2w==?=')).toBe('한글');
  });
  it('Q 인코딩 + 인접한 인코딩 단어 사이 공백 제거', () => {
    expect(decodeHeaderValue('=?UTF-8?Q?Hello_?= =?UTF-8?Q?World?=')).toBe('Hello World');
  });
  it('인코딩 없는 값은 그대로', () => {
    expect(decodeHeaderValue('Your receipt')).toBe('Your receipt');
  });
});

describe('parseMessage', () => {
  it('multipart에서 text/plain 우선', () => {
    const raw = textToBinary(
      [
        'From: "Netflix" <info@netflix.com>',
        'Subject: test',
        'Date: Thu, 03 Sep 2026 00:00:00 GMT',
        'Content-Type: multipart/alternative; boundary="xx"',
        '',
        '--xx',
        'Content-Type: text/plain; charset=utf-8',
        '',
        '평문 본문',
        '--xx',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>HTML 본문</p>',
        '--xx--',
      ].join('\r\n'),
    );
    const m = parseMessage(raw);
    expect(m.fromAddr).toBe('info@netflix.com');
    expect(m.body).toBe('평문 본문');
    expect(m.date?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });

  it('quoted-printable 본문', () => {
    const raw = textToBinary(
      ['From: a@b.com', 'Subject: x', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', '=ED=95=9C=EA=B8=80 =\n=EB=81=9D'].join('\n'),
    );
    expect(parseMessage(raw).body).toBe('한글 끝');
  });
});

describe('stripHtml', () => {
  it('태그와 엔티티 제거', () => {
    expect(stripHtml('<style>a{}</style><p>합계&nbsp;&#8361;13,500</p>')).toBe('합계 ₩13,500');
  });
});
