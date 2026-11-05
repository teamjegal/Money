# CLAUDE.md

AI 코딩 도구가 이 레포에서 작업할 때 지킬 규칙. (사람도 같이 읽기)

## 프로젝트

구독·자동결제 정리 웹사이트. Vite + React + TypeScript, 정적 사이트, GitHub Pages 배포.
구조와 판단 규칙은 README.md, 역할 분담은 docs/PLAN.md.

## 절대 규칙

- **서버·외부 API·분석 도구를 추가하지 않는다.** 메일 내용이 네트워크로 나가면 이 프로젝트의 핵심 약속이 깨진다. `fetch`는 `public/samples/` 읽기에만 쓴다.
- 분석 결과(메일 내용, 서비스 목록)를 localStorage 등에 저장하지 않는다. 저장은 `src/lib/storage.ts`를 통해 "정리 완료" 같은 체크 상태만.
- 실제 개인 메일·연결 서비스 목록을 레포에 넣지 않는다. 테스트 데이터는 가짜로 만든다.
- 금융(계좌·카드)은 직접 연동하지 않고 공식 사이트 링크로 안내만 한다.

## 작업 방법

- 명령: `npm run dev`, `npm test`, `npm run build` (타입체크 포함). 커밋 전에 `npm test && npm run build` 통과시키기.
- 파서(`src/lib/`)를 고칠 때는 잡지 못한 사례를 먼저 `*.test.ts`에 추가하고 고친다.
- 새 서비스는 `src/data/services.ts`에만 추가하면 된다. 구체적인 이름(쿠팡플레이)을 일반적인 이름(쿠팡)보다 위에. 플랫폼(Google Play, App Store)은 맨 아래.
- 메일 원문은 "바이너리 문자열"(문자 1개 = 바이트 1개)로 다룬다. 디코딩은 `mime.ts`가 charset에 맞춰 마지막에 한다. 중간에 `TextDecoder`로 미리 풀지 말 것.
- 화면 문구는 한국어, 짧고 친근하게. 금액은 `toLocaleString('ko-KR')` + "원".
- 새 라이브러리는 꼭 필요할 때만. 번들은 가볍게 유지.
