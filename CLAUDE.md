# CLAUDE.md

AI 코딩 도구가 이 레포에서 작업할 때 지킬 규칙. (사람도 같이 읽기)

## 프로젝트

**ADyson** — 문자함의 광고 문자를 보낸 곳별로 모아 080 전화·거부 링크로 수신거부를 돕는 안드로이드 앱,
그리고 "완료" 기록을 익명으로 모아 보여주는 통계 페이지. 기능·구조는 README.md, 상세는 `adsms/README.md`.

| 위치 | 내용 |
| --- | --- |
| `adsms/ADyson-v0.6-server.apk` | 앱 (소스 없음, APK만) |
| `adsms/web/index.html` | 통계 페이지 (정적 HTML 하나) |
| Supabase 프로젝트 `adsms` | `optout_events` 테이블, Edge Function `report`·`stats` |

## 절대 규칙

- **문자는 폰 밖으로 나가지 않는다.** 서버로 보내는 것은 `installId`(무작위 UUID), `method`(`080`/`link`), `ts` 세 가지뿐.
  문자 내용·발신번호·080 번호·링크 주소를 보내거나 저장하는 기능을 추가하지 않는다.
  "번호 목록을 웹에 띄우자" 같은 요청이 오면 이 원칙과 충돌한다고 먼저 알린다.
- `optout_events`는 RLS 켜고 **정책 없음**을 유지한다. 공개 키(anon/publishable)로 읽거나 쓸 수 있게 열지 않는다. 접근은 Edge Function(service role)만.
- 통계 API(`stats`)는 **집계값만** 돌려준다. 설치 ID나 개별 행을 응답에 넣지 않는다.
- `report`는 세 필드 외의 값은 버린다. 형식 검사(UUID / `080`·`link` / 최근 30일 시각)를 느슨하게 바꾸지 않는다.
- **서명 키(`*.jks`, 비밀번호 파일)는 커밋 금지.** `.gitignore`에서 막고 있다. 키를 잃으면 사용자가 앱을 지우고 다시 깔아야 한다.
- 실제 사용자 문자·전화번호를 레포나 테스트에 넣지 않는다. 예시는 가짜로 만든다.

## 앱 수정 (소스가 없을 때)

새 버전 APK를 받으면 서버 연결은 이렇게 한다. 소스가 생기면 `Stats.ENDPOINT`에 주소를 넣고 `AndroidManifest.xml`의 INTERNET 권한 주석만 풀면 된다.

1. 먼저 분석: `Stats.report()`가 여전히 `{installId, method, ts}`만 보내는지, `method` 값이 `080`/`link`인지 확인. 바뀌었으면 서버(`report`)를 먼저 맞춘다.
2. `apktool d` → `smali_classes*/com/pushmaildetect/adsms/Stats.smali`에서 빈 문자열 `""` 세 곳(필드 `ENDPOINT`, URL 생성, 길이 검사)을 report 주소로 바꾼다. 컴파일 때 상수가 인라인되므로 **세 곳 모두** 바꿔야 한다.
3. `AndroidManifest.xml`에 `<uses-permission android:name="android.permission.INTERNET"/>` 추가.
4. `apktool b` → `zipalign -p 4` → `apksigner sign`(**항상 같은 키**). 같은 키 + 더 높은 versionCode여야 덮어 설치된다.
5. 결과 APK를 다시 열어 권한 목록과 `Stats` 코드에 주소가 들어갔는지 확인한 뒤 `adsms/`에 넣는다.

Windows에서 경로에 한글이 있으면 `apksigner.bat`이 깨진다. `java -jar build-tools/<버전>/lib/apksigner.jar`로 직접 실행한다.

## 서버 (Supabase)

- 스키마를 바꿀 때는 마이그레이션으로 하고, 바꾼 뒤 보안 점검(advisors)에서 새 경고가 없는지 확인한다.
- Edge Function은 앱이 키 헤더 없이 `Content-Type`만 보내므로 `verify_jwt = false`로 둔다. 대신 함수 안에서 입력을 검사한다.
- 시각은 UTC로 저장한다. "오늘", "일별" 같은 집계는 KST(Asia/Seoul) 기준으로 계산한다.
- 테스트로 넣은 행은 테스트 후 지운다.

## 통계 페이지

- 배포 주소: https://teamjegal.github.io/Money/adsms/ — `.github/workflows/deploy.yml`의 "Add ADyson stats page" 단계가 `adsms/web/index.html`을 `dist/adsms/`로 복사한다. 파일을 추가하면 이 단계도 같이 고친다.
- 정적 HTML 파일 하나. 빌드 도구 없이 유지한다. 외부 스크립트는 **버전을 고정한** Chart.js(`chart.js@4.4.7`)와 Lucide 아이콘(`lucide@0.468.0`), 글꼴은 Google Fonts(Orbitron, JetBrains Mono)만 쓴다. `@latest`처럼 버전 없는 주소는 쓰지 않는다.
- `fetch`는 `stats` 엔드포인트에만 쓴다. 다른 외부 API·분석 도구를 붙이지 않는다.
- 화면의 모든 숫자는 실제 `stats` 값이어야 한다. 가짜(목업) 숫자, 문자 발신처·제목·내용, 지역·카테고리·금액처럼 서버에 없는 데이터는 넣지 않는다.
- 실시간 로그는 새로고침 사이 집계값의 증가분(080 +N, 링크 +N, 새 사용자)으로 만든다. 개별 기록을 내려받지 않는다.
- 화면 문구는 한국어, 짧고 친근하게. 숫자는 `Intl.NumberFormat('ko-KR')`.

## 레포의 이전 프로젝트 (구독 정리 사이트)

`src/`, `public/`, `index.html`, `package.json`, `.github/workflows/`, `docs/PLAN.md`는 이전 프로젝트(Vite + React, GitHub Pages 배포)다.
ADyson 작업 때는 건드리지 않는다. 이 코드를 고칠 때는 `npm test && npm run build`를 통과시키고, 메일 내용이 네트워크로 나가지 않게 한다.
`main`에 푸시하면 이 사이트의 CI·배포가 돈다는 점을 기억한다.
