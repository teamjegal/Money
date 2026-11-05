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

## 실제 사이트에서 쓰기 (팝업)

1. 체크리스트에서 서비스의 **[AI로 해제]** → 홈페이지가 새 탭으로 열리고 확장 아이콘에 **?** 표시
   (데모쇼핑처럼 `settings_url`이 있으면 설정 페이지가 바로 열리고 자동으로 진행)
2. 그 사이트에 **직접 로그인** → 마이페이지 > 알림(수신) 설정 페이지로 이동
3. 확장 아이콘 클릭 → **[이 페이지에서 광고 동의 찾기]**
4. 페이지의 노란 강조 + 배너 확인 → **[승인]** → 끄고 저장 → 체크리스트의 같은 도메인 서비스에 ✅
   (www.coupang.com → coupang.com, 합쳐진 서비스는 도메인 중 하나만 맞아도)
5. 못 찾으면 "이 페이지에서 광고 수신 항목을 찾지 못했어요…" 안내

권한: 특정 사이트 권한 없이 `activeTab`만 사용 → 아이콘을 누른 그 탭에서만, 누른 순간에만 페이지를 읽는다.
그래서 [AI로 해제]로 연 홈페이지에는 배너를 띄울 수 없고, 대신 아이콘 "?" 표시와 팝업·체크리스트에 안내한다.

스캔 범위: 맨 위 문서만(iframe 제외), 화면에 보이는 요소만, 최대 200개(토글 → 버튼 → 링크 순으로 남김).

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
