import type { MailHit } from '../types';
import { detectFromLine, detectFromRaw, looksLikeRawMail } from './detect';
import { readMailFile, splitMbox } from './mbox';
import { textToBinary } from './mime';

export interface MailScanResult {
  scanned: number;
  hits: MailHit[];
}

/** .mbox / .eml 파일들 분석 */
export async function analyzeFiles(
  files: File[],
  onProgress: (ratio: number, scanned: number) => void,
): Promise<MailScanResult> {
  const hits: MailHit[] = [];
  let scanned = 0;
  const totalBytes = files.reduce((n, f) => n + f.size, 0) || 1;
  let doneBytes = 0;
  for (const file of files) {
    await readMailFile(
      file,
      (raw) => {
        scanned++;
        const hit = detectFromRaw(raw);
        if (hit) hits.push(hit);
      },
      (p) => onProgress((doneBytes + p.bytesRead) / totalBytes, scanned),
    );
    doneBytes += file.size;
  }
  return { scanned, hits };
}

/** 붙여넣은 텍스트 분석: 메일 원문이면 MIME으로, 아니면 메일함 목록으로 본다 */
export function analyzePastedText(text: string): MailScanResult {
  if (looksLikeRawMail(text)) {
    const messages = splitMbox(textToBinary(text));
    const hits = messages.map(detectFromRaw).filter((h): h is MailHit => !!h);
    return { scanned: messages.length, hits };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hits = lines.map(detectFromLine).filter((h): h is MailHit => !!h);
  return { scanned: lines.length, hits };
}
