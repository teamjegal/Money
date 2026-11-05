# 동의 클리너 크롬 확장 프로그램

## 설치 (압축해제된 확장 프로그램 로드)

1. `npm start`로 서버를 띄운다 (http://localhost:3000).
2. 크롬 주소창에 `chrome://extensions` 입력.
3. 오른쪽 위 **개발자 모드**를 켠다.
4. 왼쪽 위 **압축해제된 확장 프로그램을 로드합니다** 클릭.
5. 이 프로젝트의 `extension` 폴더를 선택 (폴더 안의 파일이 아니라 폴더 자체).
6. 목록에 "동의 클리너"가 나타나고 오류가 없는지 확인.
7. http://localhost:3000 을 **새로고침** → 오른쪽 위에 "● 확장 프로그램 연결됨".
8. 크롬 툴바의 퍼즐 아이콘 → 동의 클리너 📌 고정 (팝업을 쓰기 쉽게).

## 실제 사이트에서 쓰기

체크리스트의 **[AI로 해제]**:
- **알림 설정 페이지를 아는 서비스** (`services.json`의 `settings_page`: Facebook, GitHub, LinkedIn, Pinterest, Netflix, X, YouTube, Chess.com …)
  → 데모쇼핑과 똑같이 **자동 진행**: 설정 페이지 열기 → (로그인 화면이면 사용자가 로그인할 때까지 최대 2분 대기)
  → 로그인 후 홈 등으로 가면 설정 페이지로 다시 이동 → 늦게 그려지는 화면은 2초 뒤 다시 읽기
  → 노란 강조 + 승인 배너 → **[승인]** → 끄고 저장 → 체크리스트 ✅
- **모르는 서비스** → 홈페이지를 열고 그 위에 안내 배너 + 아이콘 "?"
  → 사용자가 알림 설정 페이지로 이동 → 확장 아이콘 **[이 페이지에서 광고 동의 찾기]** → 같은 흐름 → 도메인이 맞는 서비스에 ✅
- 대상을 못 찾으면 "이 페이지에서 광고 수신 항목을 찾지 못했어요…" 안내

로그인(원칙 1)과 [승인] 클릭(원칙 2)은 항상 사용자가 직접 한다.

권한: `https://*/*` 사이트 권한 (설치·새로고침 때 "모든 웹사이트의 데이터 읽기 및 변경" 경고가 뜸).
[AI로 해제]를 누른 탭에서만 스캔·배너를 띄우고, 다른 탭은 건드리지 않는다.

스캔 범위: 맨 위 문서만(iframe 제외), 화면에 보이는 요소만, 최대 200개(토글 → 버튼 → 링크 순으로 남김).
토글이 하나도 없는 페이지는 서버(LLM)를 부르지 않는다.

알려진 서비스 추가: `server/services.json`에 `"도메인": { "service", "category", "homepage", "settings_page" }` 한 줄.

## 코드를 고친 뒤

- `background.js`, `core.js`, `popup.*`, `manifest.json` 수정 → `chrome://extensions`에서 동의 클리너의 **새로고침(↻)** 버튼.
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
| 웹 → 확장 | `{ source: "cc-web", requestId, type: "GUIDE", payload: { service, domain } }` → `{ status: "guided" }` |
| 확장 → 웹 | `{ source: "cc-ext", requestId, result }` |
| 확장 → 웹 | `{ source: "cc-ext", type: "REVOKED", host, result }` (팝업으로 다른 사이트에서 해제한 결과) |
| 팝업 → background | `{ type: "SCAN_ACTIVE", tabId }` → `banner` / `none` / `need_login` / `error` |

`result` 종류:
- `{ status: "done", changed: [라벨], failed: [라벨], saved, tabId, mode, targets }` — 승인 후 해제 완료 (failed가 있으면 설정 탭에 빨간 표시가 남음)
- `{ status: "cancelled", reason: "user" | "timeout" }` — 배너에서 취소했거나 3분 동안 응답 없음
- `{ status: "need_login", tabId, error }` — 2분 안에 로그인하지 않음
- `{ status: "error", error }`

## REVOKE 처리 순서 (background.js)

1. `settings_url`을 새 탭으로 열고 로딩 완료 대기
2. `scan.js` 주입 → 비밀번호 칸이 보이면 `need_login`, 사용자가 로그인해 페이지가 바뀌면 다시 스캔 (최대 2분)
3. 컨트롤마다 `data-cc-id` 부여, 라벨 추출 (label[for] → 감싸는 label → aria-label → aria-labelledby → 옆 텍스트, 버튼·링크는 자기 글자)
4. **안전 필터**: 탈퇴/삭제/해지/결제/구매/비밀번호/로그아웃 포함 요소 제거 (서버 `server/safety.js`에도 같은 규칙)
5. `POST http://localhost:3000/api/pick-targets` → 서버가 다시 거르고 LLM 또는 키워드 규칙으로 선택
6. 응답 id가 4번의 안전한 목록 안에 있는지 다시 확인
7. `overlay.js` 주입 → 대상 노란 강조 + 말풍선(reason) + 상단 승인 배너 (Shadow DOM)
8. **[승인]을 눌러야만** 켜져 있는 대상만 `click()` → 저장 버튼 `click()` → 2초 뒤 다시 읽어 검증
9. 결과를 웹으로 응답. 모두 성공하면 1.8초 뒤 체크리스트 탭으로 돌아감. 저장 중 페이지가 새로 로드되면 다시 스캔해서 라벨로 검증
