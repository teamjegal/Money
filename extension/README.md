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
| 확장 → 웹 | `{ source: "cc-ext", requestId, result: { status: "opened", tabId, url } }` 또는 `{ status: "error", error }` |
