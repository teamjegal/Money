# 동의 클리너 크롬 확장 프로그램

## 설치 (압축해제된 확장 프로그램 로드)

1. `npm start`로 서버를 띄운다 (http://localhost:3000).
2. 크롬 주소창에 `chrome://extensions` 입력.
3. 오른쪽 위 **개발자 모드**를 켠다.
4. 왼쪽 위 **압축해제된 확장 프로그램을 로드합니다** 클릭.
5. 이 프로젝트의 `extension` 폴더를 선택 (폴더 안의 파일이 아니라 폴더 자체).
6. 목록에 "동의 클리너"가 나타나고 오류가 없는지 확인.
7. http://localhost:3000 을 **새로고침** → 오른쪽 위에 "● 확장 프로그램 연결됨".

## 코드를 고친 뒤

- `background.js`, `manifest.json` 수정 → `chrome://extensions`에서 동의 클리너의 **새로고침(↻)** 버튼.
- `bridge.js`, `overlay.js` 수정 → 위 새로고침 후 **웹페이지도 새로고침**.
- 확장만 새로고침하고 웹페이지를 그대로 두면 연결이 끊겨 "확장 프로그램이 다시 로드됐어요" 오류가 난다.

## 디버깅

- background 로그: `chrome://extensions` → 동의 클리너 → **서비스 워커** 링크 → 콘솔.
- bridge 로그: 웹페이지에서 F12 → 콘솔.
- 로직 검증(크롬 없이): `node scripts/test-extension.js`

## 메시지 형식

| 방향 | 메시지 |
|---|---|
| 확장 → 웹 | `{ source: "cc-ext", type: "READY" }` |
| 웹 → 확장 | `{ source: "cc-web", type: "PING" }` (READY를 놓쳤을 때) |
| 웹 → 확장 | `{ source: "cc-web", requestId, type: "REVOKE", payload: { service, domain, settings_url } }` |
| 확장 → 웹 | `{ source: "cc-ext", requestId, result }` |

`result` 종류:
- `{ status: "picked", tabId, url, mode, targets: [{id, reason, label}], save_id, save_label, removed, scanned }` — 해제 대상 선택 완료 (아직 클릭 안 함)
- `{ status: "need_login", tabId, error }` — 2분 안에 로그인하지 않음
- `{ status: "error", error }`

## REVOKE 처리 순서 (background.js)

1. `settings_url`을 새 탭으로 열고 로딩 완료 대기
2. `scan.js` 주입 → 비밀번호 칸이 보이면 `need_login`, 사용자가 로그인해 페이지가 바뀌면 다시 스캔 (최대 2분)
3. 컨트롤마다 `data-cc-id` 부여, 라벨 추출 (label[for] → 감싸는 label → aria-label → aria-labelledby → 옆 텍스트, 버튼·링크는 자기 글자)
4. **안전 필터**: 탈퇴/삭제/해지/결제/구매/비밀번호/로그아웃 포함 요소 제거 (서버 `server/safety.js`에도 같은 규칙)
5. `POST http://localhost:3000/api/pick-targets` → 서버가 다시 거르고 LLM 또는 키워드 규칙으로 선택
6. 응답 id가 4번의 안전한 목록 안에 있는지 다시 확인 → 결과를 콘솔에 찍고 웹에 응답
