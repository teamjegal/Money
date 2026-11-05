# Gmail 연결 설정 (읽기 전용)

## 1. Google Cloud에서 OAuth 클라이언트 만들기 (한 번만)

1. https://console.cloud.google.com 접속 → 위쪽 프로젝트 선택 → **새 프로젝트** (이름 예: consent-cleaner)
2. **API 및 서비스 → 라이브러리** → "Gmail API" 검색 → **사용**
3. **API 및 서비스 → OAuth 동의 화면** (또는 Google 인증 플랫폼)
   - 사용자 유형: **외부**
   - 앱 이름: 동의 클리너, 지원 이메일·개발자 연락처: 본인 메일
   - 범위(데이터 액세스): `https://www.googleapis.com/auth/gmail.readonly` 추가
   - **테스트 사용자(대상)**: 분석할 Gmail 주소 추가 ← 빠뜨리면 로그인 시 "액세스 차단됨"
   - 게시 상태는 **테스트**로 둔다 (검수 불필요, 테스트 사용자만 로그인 가능)
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `http://localhost:3000/oauth2callback` (정확히 이 값)
   - 만들기 → 클라이언트 ID와 클라이언트 보안 비밀번호 복사

## 2. .env에 넣기

```
GOOGLE_CLIENT_ID=복사한ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=복사한보안비밀번호
```

`.env`는 git에 올라가지 않는다 (`.gitignore`). 팀원끼리는 메신저로 따로 공유하거나 각자 만든다.

## 3. 실행·확인

1. `npm start` → 콘솔에 "Gmail 연결 준비됨 (읽기 전용)"
2. http://localhost:3000 → **[Gmail로 분석하기]**
3. 구글 화면에서 계정 선택 → "Google에서 확인하지 않은 앱" 경고 → **고급 → 동의 클리너(으)로 이동** (테스트 앱이라 정상)
4. 권한: "이메일 메시지 및 설정 보기" **하나만** 요청되는지 확인 → 계속
5. 웹으로 돌아오면 자동으로 분석 시작 → "메일 812/1500 확인 중" → 체크리스트
6. 끝나면 **[연결 끊기]** → 서버 메모리의 토큰·결과 삭제 + 구글 쪽 권한도 철회

## 알아둘 점

- 가져오는 것: 최근 12개월, 최대 1500통의 **헤더 5개**(From, Subject, Date, List-Unsubscribe, List-Unsubscribe-Post). 본문은 요청하지 않는다(`format=metadata`).
- 보낸편지함·임시보관함·채팅, 그리고 gmail.com·naver.com 같은 개인 메일 주소에서 온 메일은 서비스 목록에서 뺀다.
- 토큰은 refresh token 없이(`access_type=online`) 받으므로 1시간 뒤 만료된다. 만료되면 다시 연결하면 된다.
- 서버를 재시작하면 연결이 끊긴다 (메모리에만 저장).
- 범위 조정: `.env`의 `GMAIL_MONTHS`, `GMAIL_MAX_MESSAGES`, `GMAIL_CONCURRENCY`.
- 회사·학교(Google Workspace) 계정은 관리자가 외부 앱을 막아 둘 수 있다. 개인 Gmail로 시험한다.
- 구글 로그인 없이 파이프라인 검증: `node scripts/test-gmail.js`
