/**
 * "정리 완료" 체크 같은 개인 편의 상태만 localStorage에 저장한다.
 * 메일 내용·분석 결과는 저장하지 않는다 (새로고침하면 사라지는 게 정상).
 */
const PREFIX = 'money:';

export function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSet(key: string, value: Set<string>): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify([...value]));
  } catch {
    /* 사생활 보호 모드 등에서는 저장하지 않는다 */
  }
}
