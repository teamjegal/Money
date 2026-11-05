/**
 * 최소한의 MIME 파서. 메일 원문은 항상 "바이너리 문자열"(문자 1개 = 바이트 1개)로 다룬다.
 * 그래야 EUC-KR 8bit 본문도 깨지지 않고, 마지막에 선언된 charset으로 디코드할 수 있다.
 */
import type { MailMessage } from '../types';

const MAX_BODY = 30_000;

const CHARSET_ALIASES: Record<string, string> = {
  'ks_c_5601-1987': 'euc-kr',
  ks_c_5601: 'euc-kr',
  cp949: 'euc-kr',
  'x-windows-949': 'euc-kr',
  'unicode-1-1-utf-8': 'utf-8',
};

export function bytesToBinary(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

export function binaryToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

/** 붙여넣은 일반 텍스트(유니코드)를 바이너리 문자열로 바꾼다. */
export function textToBinary(text: string): string {
  return bytesToBinary(new TextEncoder().encode(text));
}

export function decodeBytes(bytes: Uint8Array, charset = 'utf-8'): string {
  const cs = charset.toLowerCase().split('*')[0].trim();
  const name = CHARSET_ALIASES[cs] ?? cs;
  try {
    return new TextDecoder(name).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const countBad = (s: string) => (s.match(/�/g) ?? []).length;

/** 선언된 charset으로 디코드하되, 깨지면 utf-8 / euc-kr 중 덜 깨지는 쪽을 쓴다. */
function smartDecode(bytes: Uint8Array, charset?: string): string {
  const first = decodeBytes(bytes, charset ?? 'utf-8');
  if (!first.includes('�')) return first;
  const altCharset = charset && !/utf-?8/i.test(charset) ? 'utf-8' : 'euc-kr';
  const alt = decodeBytes(bytes, altCharset);
  return countBad(alt) < countBad(first) ? alt : first;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  try {
    return binaryToBytes(atob(padded));
  } catch {
    return new Uint8Array();
  }
}

function qpToBytes(s: string, header = false): Uint8Array {
  let src = header ? s.replace(/_/g, ' ') : s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(src.charCodeAt(i) & 0xff);
    }
  }
  src = '';
  return new Uint8Array(out);
}

/** "=?UTF-8?B?...?=" 같은 RFC 2047 인코딩 헤더를 풀어준다. */
export function decodeHeaderValue(raw: string): string {
  let s = /[\x80-\xff]/.test(raw) ? smartDecode(binaryToBytes(raw)) : raw;
  s = s.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1');
  return s
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, text: string) => {
      const bytes = enc.toUpperCase() === 'B' ? base64ToBytes(text) : qpToBytes(text, true);
      return decodeBytes(bytes, cs);
    })
    .trim();
}

export function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(i + 1).trim());
  }
  return headers;
}

export function getParam(value: string, name: string): string | undefined {
  const m = new RegExp(`;\\s*${name}\\*?\\s*=\\s*("([^"]*)"|[^;\\s]+)`, 'i').exec(value);
  if (!m) return undefined;
  return m[2] ?? m[1];
}

function splitHeaderBody(raw: string): [string, string] {
  const m = /\r?\n\r?\n/.exec(raw);
  if (!m) return [raw, ''];
  return [raw.slice(0, m.index), raw.slice(m.index + m[0].length)];
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function decodePart(headers: Map<string, string>, body: string): string {
  const ct = headers.get('content-type') ?? 'text/plain';
  const cte = (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase();
  const charset = getParam(ct, 'charset');
  const bytes = cte.includes('base64')
    ? base64ToBytes(body)
    : cte.includes('quoted-printable')
      ? qpToBytes(body)
      : binaryToBytes(body);
  return smartDecode(bytes, charset);
}

interface Collected {
  plain: string[];
  html: string[];
}

function collectText(headers: Map<string, string>, body: string, acc: Collected, depth = 0): void {
  const ct = headers.get('content-type') ?? 'text/plain';
  const type = ct.split(';')[0].trim().toLowerCase();
  const disposition = (headers.get('content-disposition') ?? '').toLowerCase();
  if (disposition.startsWith('attachment')) return;

  if (type.startsWith('multipart/')) {
    const boundary = getParam(ct, 'boundary');
    if (!boundary || depth > 5) return;
    const segments = body.split('--' + boundary);
    for (const seg of segments.slice(1)) {
      if (seg.startsWith('--')) break;
      const [h, b] = splitHeaderBody(seg.replace(/^\r?\n/, ''));
      collectText(parseHeaders(h), b, acc, depth + 1);
    }
    return;
  }
  if (type === 'text/plain') acc.plain.push(decodePart(headers, body));
  else if (type === 'text/html') acc.html.push(stripHtml(decodePart(headers, body)));
}

export function extractAddress(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  const bare = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(angle ? angle[1] : from);
  return (bare?.[0] ?? '').toLowerCase();
}

export function displayName(from: string): string {
  const name = from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();
  return name || extractAddress(from).split('@')[0];
}

export interface ParsedHeaderInfo {
  from: string;
  fromAddr: string;
  subject: string;
  date: Date | null;
  headers: Map<string, string>;
  rawBody: string;
}

/** 헤더만 먼저 파싱 (본문 디코딩은 비싸서, 필요한 메일만 나중에 한다) */
export function parseHeadersOnly(raw: string): ParsedHeaderInfo {
  const [h, rawBody] = splitHeaderBody(raw);
  const headers = parseHeaders(h);
  const from = decodeHeaderValue(headers.get('from') ?? '');
  const d = headers.get('date') ? new Date(headers.get('date')!) : null;
  return {
    from,
    fromAddr: extractAddress(from),
    subject: decodeHeaderValue(headers.get('subject') ?? ''),
    date: d && !Number.isNaN(d.getTime()) ? d : null,
    headers,
    rawBody,
  };
}

export function decodeBody(info: ParsedHeaderInfo): string {
  const acc: Collected = { plain: [], html: [] };
  collectText(info.headers, info.rawBody, acc);
  const text = acc.plain.join('\n').trim() || acc.html.join('\n').trim();
  return text.slice(0, MAX_BODY);
}

/** 메일 원문(바이너리 문자열) 한 통을 파싱한다. */
export function parseMessage(raw: string): MailMessage {
  const info = parseHeadersOnly(raw);
  return {
    from: info.from,
    fromAddr: info.fromAddr,
    subject: info.subject,
    date: info.date,
    body: decodeBody(info),
  };
}
