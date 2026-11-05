# ADyson — 광고 문자, 수신거부까지 한 번에

문자함에서 **080 수신거부 번호와 거부 링크가 있는 광고 문자**를 보낸 곳별로 모아주고,
버튼 하나로 080 전화 걸기·거부 링크 열기까지 이어주는 안드로이드 앱.

- **문자는 이 폰 안에서만 분석된다.** 문자 내용·전화번호·080 번호는 서버로 보내지 않는다.
- 서버에는 "완료"를 누른 사실만 익명으로 모인다 → 전체 수신거부 통계 페이지.

## 앱 기능

| 화면 / 기능 | 하는 일 |
| --- | --- |
| 권한 안내 | `READ_SMS` 권한 요청. 권한 창이 안 뜨면 "앱 정보 → ⋮ → 제한된 설정 허용" 안내 |
| 광고 모으기 | 문자함(`content://sms/inbox`)을 읽어 `(광고)` 표기, 080 번호, 거부 링크, "수신거부/차단/해지" 문구를 찾아 **보낸 곳별로 묶음**. 많이 받은 순 정렬 |
| 발신처 이름 추정 | 문자 첫머리에서 `○○카드`, `○○은행`, `○○몰` 같은 이름을 뽑아 표시. 못 찾으면 "발신처 미확인" |
| 080 수신거부 | 080 번호를 다이얼 화면에 띄움 (`ACTION_DIAL`, 바로 걸지 않음) |
| 링크 수신거부 | 확인 창 후 브라우저로 열기. `(광고)` 표기가 없는 문자는 **스미싱 경고**를 보여줌 |
| 완료 처리 | "수신거부를 끝까지 마쳤나요?" → **완료**를 누르면 목록에서 빠지고 "완료" 탭으로 이동. 되돌리기 가능 |
| 자동 감지 | "수신거부가 완료되었습니다" 같은 확인 문자가 오면 완료로 표시 |
| 재발송 알림 | 거부한 뒤에도 같은 곳에서 광고가 오면 "거부했는데 또 왔어요 · N건" 표시 |
| 요약 | "광고를 보낸 곳이 N곳 있어요", "N곳 중 M곳 거부했어요" |

완료 기록은 폰 안(`SharedPreferences`)에만 저장된다.

## 서버로 가는 데이터 (이것만)

"완료"를 누를 때마다 `Stats.report()`가 한 번 보낸다.

```json
{ "installId": "무작위 UUID", "method": "080 | link", "ts": 1793891937331 }
```

- `installId`: 앱 설치 때 만든 무작위 ID. 사람·전화번호와 연결되지 않는다.
- 문자 내용, 발신번호, 080 번호, 링크 주소는 **보내지 않는다.**

## 서버 (Supabase)

프로젝트 `adsms` (서울 리전). 테이블 하나와 Edge Function 두 개.

| 구성 | 내용 |
| --- | --- |
| `optout_events` 테이블 | `install_id`, `method`(`080`/`link`), `ts`, `received_at`. RLS 켜짐 + 정책 없음 → **공개 키로 읽기·쓰기 불가** |
| `POST /functions/v1/report` | 앱이 호출. 형식 검사(UUID, method, 최근 30일 시각) 후 저장. 세 필드 외에는 버림. 중복 무시 |
| `GET /functions/v1/stats` | 통계 페이지가 호출. **집계값만** 반환 `{ total, users, avgPerUser, method080, methodLink, today, lastHour, lastAt, hourly[24], updatedAt }` |

기본 주소: `https://prqezaecwmfvjhfmqytf.supabase.co`

## 통계 페이지

**배포 주소: https://teamjegal.github.io/Money/adsms/**

`adsms/web/index.html` — 파일 하나짜리 정적 페이지. `main`에 푸시하면 GitHub Actions가 위 주소로 함께 배포한다.

에디토리얼·스위스 디자인 — 신문 기사처럼 큰 세리프 제목과 격자, 선으로 통계를 문장으로 읽게 한다. 모든 숫자는 실제 서버 집계값이다.

- 헤드라인: "N건의 광고에 '그만'이라고 말했다." + 사용자 수·1인당 평균 문장
- 지표 4칸: 080 전화 / 거부 링크 / 오늘(KST) / 마지막 기록 시각
- "언제 거부하나": 0~23시(KST) 시간대별 누적 막대, 가장 많은 시간
- "어떻게 거부하나": 080(빨강) vs 링크(검정) 비율 막대
- 30초마다 자동 새로고침, 상단에 LIVE/OFFLINE과 갱신 시각
- 외부 스크립트 없음 (글꼴만 Google Fonts: Instrument Serif, Inter). 그래프는 CSS로 그린다.

로컬에서 볼 때:

```bash
python -m http.server 5173 --directory adsms/web   # http://localhost:5173
```

## 앱 설치

1. `adsms/ADyson-v0.6-server.apk`를 폰으로 옮겨 설치 ("출처를 알 수 없는 앱" 허용).
2. Play 프로텍트 경고가 뜨면 "무시하고 설치".
3. 서버 미연결 원본이 깔려 있으면 서명이 달라서 **먼저 삭제**해야 한다.

## 폴더 구조

```
adsms/
  ADyson-v0.6-server.apk   서버 연결본 APK (원본 v0.6 + ENDPOINT + INTERNET 권한, 재서명)
  web/index.html           수신거부 통계 페이지
  README.md                앱·서버 상세 설명
```

> **앱 소스 코드는 이 레포에 없다.** APK만 있다. 앱을 고칠 때의 절차는 `CLAUDE.md` 참고.

## 레포에 함께 있는 것 (이전 프로젝트)

`src/`, `public/`, `index.html`, `package.json`, `.github/workflows/`, `docs/PLAN.md`는
이전에 만든 **구독 정리 웹사이트**(Vite + React)다. `main`에 푸시하면 GitHub Actions가
테스트·빌드 후 `https://teamjegal.github.io/Money/`에 배포한다. ADyson과는 관계없다.
배포 단계에서 ADyson 통계 페이지 하나만 `/Money/adsms/`로 복사해 함께 올린다 (APK는 배포하지 않음).

```bash
npm install && npm run dev   # 구독 정리 사이트 로컬 실행 (Node 22.12+)
```
