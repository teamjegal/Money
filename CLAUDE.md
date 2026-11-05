# 프로젝트: 메일로 찾는 개인정보 대청소 (가칭 "동의 클리너")

바이브코딩 대회용 프로젝트. 3인 팀, 대회 기간 내 완성이 목표.
완벽함보다 **시연이 안정적으로 되는 것**이 최우선이다.

## 한 줄 소개
메일(.mbox 또는 붙여넣기)만으로 내가 가입한 서비스를 찾아 체크리스트로 보여주고,
크롬 확장 프로그램이 사용자가 로그인해 둔 브라우저에서 광고·마케팅 수신 동의 해제를 도와준다.

## 핵심 원칙 (절대 어기지 말 것)
1. **비밀번호·인증정보를 절대 받거나 저장하지 않는다.** 로그인은 사용자가 직접 한다.
2. **AI는 클릭 전에 반드시 사용자 승인을 받는다.** 승인 배너 없이 자동 클릭 금지.
3. "탈퇴, 삭제, 해지, 결제, 구매, 비밀번호, 로그아웃" 등이 포함된 요소는 **코드 단에서 클릭 후보에서 제외**한다. (LLM 판단과 무관하게)
4. API 키는 **서버(.env)에만** 둔다. 프론트엔드·확장 프로그램 코드에 키를 넣지 않는다.
5. LLM 호출이 실패하거나 키가 없으면 **키워드 규칙 기반 대체 로직**으로 동작해야 한다. (시연 중 네트워크 문제 대비)
6. 시연은 실제 사이트가 아니라 **팀이 만든 가짜 쇼핑몰(demo-shop)** 과 **샘플 .mbox** 로 한다.

## 기술 스택
- 서버: Node.js 20+, Express, `@anthropic-ai/sdk`, `mailparser`, `dotenv`
- 웹: 순수 HTML/CSS/JS (빌드 도구 없음)
- 확장 프로그램: Chrome Manifest V3
- 실행: `npm start` → http://localhost:3000

## 폴더 구조
```
consent-cleaner/
├─ CLAUDE.md
├─ package.json
├─ .env.example            # ANTHROPIC_API_KEY=, MODEL=
├─ server/
│  ├─ index.js             # Express: 정적 파일 + API 라우트
│  ├─ mbox.js              # .mbox 분리·파싱, 도메인별 그룹핑
│  ├─ llm.js               # LLM 호출 래퍼 + 실패 시 대체 로직
│  ├─ prompts.js           # 모든 프롬프트 모음
│  └─ services.json        # 알려진 서비스 DB (도메인 → 이름, 설정 페이지 URL)
├─ web/                    # 체크리스트 웹사이트 (http://localhost:3000/)
│  ├─ index.html
│  ├─ app.js
│  └─ style.css
├─ demo-shop/              # 시연용 가짜 쇼핑몰 (http://localhost:3000/demo-shop/)
│  ├─ index.html           # 가짜 로그인
│  └─ settings.html        # 알림·마케팅 수신 설정 페이지
├─ extension/              # 크롬 확장 프로그램
│  ├─ manifest.json
│  ├─ background.js
│  ├─ bridge.js            # 웹페이지 <-> 확장 메시지 중계 (content script)
│  └─ overlay.js           # 강조 + 승인 배너 + 클릭 실행
└─ samples/
   └─ demo.mbox            # 시연용 샘플 메일함
```

## API 설계 (server)
- `POST /api/analyze` — body: mbox 텍스트 또는 붙여넣은 메일 텍스트 → 서비스 목록(JSON 배열)
- `POST /api/pick-targets` — body: 설정 페이지에서 뽑은 컨트롤 목록 → 해제 대상 id 목록 + 저장 버튼 id
- `POST /api/deletion-email` — body: 서비스 정보 → 개인정보 삭제 요청 메일 초안

## 데이터 형식

### 서비스 항목 (/api/analyze 응답 배열의 원소)
```json
{
  "service": "데모쇼핑",
  "domain": "demo-shop.example",
  "category": "쇼핑",
  "signals": ["가입 환영 메일", "광고 메일 12건", "휴면 전환 안내"],
  "marketing_consent": true,
  "first_seen": "2024-03-02",
  "last_seen": "2026-10-20",
  "risk": "high",
  "reason": "광고 메일은 계속 오지만 주문 기록은 2년 전",
  "unsubscribe": "https://... 또는 mailto:... 또는 null",
  "settings_url": "http://localhost:3000/demo-shop/settings.html 또는 null",
  "contact_email": "privacy@... 또는 null"
}
```

### 설정 페이지 컨트롤 (확장 → /api/pick-targets 요청)
```json
{
  "url": "...",
  "controls": [
    { "id": "cc-3", "kind": "checkbox", "label": "이메일 광고 수신 동의", "checked": true },
    { "id": "cc-7", "kind": "button", "label": "저장" }
  ]
}
```

### 해제 대상 (/api/pick-targets 응답)
```json
{ "targets": [{ "id": "cc-3", "reason": "광고성 이메일 수신 동의" }], "save_id": "cc-7" }
```

## 메일 분류 규칙 (힌트)
- 제목에 "(광고)" → 광고 메일, 마케팅 동의 상태
- "가입을 환영", "이메일 인증", "회원가입 완료" → 가입 확정
- "개인정보 이용내역" → 가입 확정 + 정보 보유 중
- "휴면", "장기 미이용" → 오래 안 쓴 계정 (위험도 상승)
- "주문", "결제 완료", "영수증" → 실제 이용 기록
- `List-Unsubscribe` 헤더 → 수신거부 링크

## 위험도 기준
- high: 광고는 계속 오는데 이용 기록이 1년 이상 없음, 또는 휴면 안내 받음
- medium: 광고 동의 상태이고 가끔 이용
- low: 정보성 메일만 옴

## 사용자 흐름 (시연 시나리오)
1. 웹에서 samples/demo.mbox 업로드 → [분석하기]
2. 요약 카드: "가입처 N곳 · 광고 수신 중 N곳 · 휴면 예정 N곳" + 위험도 순 체크리스트
3. 항목 펼치기 → AI 판단 근거 표시
4. 데모쇼핑 줄에서 [AI로 해제] → 확장이 설정 페이지 새 탭으로 열기 → 광고 토글 노란 강조 + 승인 배너 → [승인] → 토글 끄고 저장 → 웹 체크리스트에 ✅, 진행률 증가
5. 다른 항목은 [수신거부] 또는 [삭제 요청 메일]

## 코딩 규칙
- 한국어 UI. 코드 주석도 한국어로 간단히.
- 파일 하나가 300줄 넘으면 나눈다.
- 새 기능을 만들면 **직접 실행해서 동작을 확인**하고, 확인 방법을 알려줄 것.
- 외부 CDN 의존 최소화 (대회장 네트워크 불안정 대비).
