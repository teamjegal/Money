/**
 * .mbox / .eml 읽기. Gmail Takeout mbox는 수 GB가 될 수 있어서 스트리밍으로 한 통씩 넘긴다.
 * 넘기는 문자열은 바이너리 문자열이다 (mime.ts 참고).
 */
import { bytesToBinary } from './mime';

const SEPARATOR = /(?:^|\r?\n)From [^\r\n]*\r?\n/;

/** mbox 문자열을 메일 원문 배열로 나눈다. 구분선이 없으면 통째로 메일 1통(.eml). */
export function splitMbox(text: string): string[] {
  return text.split(SEPARATOR).filter((part) => part.trim().length > 0);
}

export interface ReadProgress {
  bytesRead: number;
  totalBytes: number;
}

/**
 * 파일을 조금씩 읽으면서 완성된 메일을 onMessage로 넘긴다.
 * onMessage가 동기 함수여도 청크마다 이벤트 루프에 양보해서 UI가 멈추지 않는다.
 */
export async function readMailFile(
  file: Blob,
  onMessage: (raw: string) => void,
  onProgress?: (p: ReadProgress) => void,
): Promise<void> {
  const reader = file.stream().getReader();
  let buf = '';
  let bytesRead = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.length;
    buf += bytesToBinary(value);
    const cut = buf.lastIndexOf('\nFrom ');
    if (cut > 0) {
      const complete = buf.slice(0, cut);
      buf = buf.slice(cut + 1);
      for (const m of splitMbox(complete)) onMessage(m);
    }
    onProgress?.({ bytesRead, totalBytes: file.size });
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const m of splitMbox(buf)) onMessage(m);
  onProgress?.({ bytesRead: file.size, totalBytes: file.size });
}
