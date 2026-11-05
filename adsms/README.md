# ADyson — 광고 문자 수신거부 앱 + 통계 페이지

구독 정리 웹사이트(레포 루트)와는 **별개의 프로젝트**입니다. Vite 빌드에는 포함되지 않고, 배포 때 통계 페이지(`web/index.html`)만 `/Money/adsms/`로 복사됩니다. APK는 배포되지 않습니다.

| 파일 | 내용 |
| --- | --- |
| `ADyson-v0.6-server.apk` | 안드로이드 앱 (v0.6, 서버 연결 버전) |
| `web/index.html` | 수신거부 관제 페이지 (HUD 디자인: 지표 4개, 레이더, 실시간 로그, 방법 비율·시간대 차트, 30초 자동 새로고침) |

## 어떤 데이터가 서버로 가나

사용자가 앱에서 "완료"를 누를 때마다 아래 세 가지만 보냅니다.

- 무작위로 만든 익명 설치 ID
- 거부 방법 (`080` / `link`)
- 시각

문자 내용, 전화번호, 080 번호는 보내지 않습니다. **문자는 폰 밖으로 나가지 않습니다.**

## 서버 (Supabase)

| 엔드포인트 | 용도 |
| --- | --- |
| `POST https://prqezaecwmfvjhfmqytf.supabase.co/functions/v1/report` | 앱이 `{installId, method, ts}` 전송 → `optout_events` 테이블에 저장 |
| `GET https://prqezaecwmfvjhfmqytf.supabase.co/functions/v1/stats` | 집계값만 반환 `{total, users, avgPerUser, method080, methodLink, today, lastHour, lastAt, hourly[24], updatedAt}` |

- `optout_events` 테이블은 공개 키로 읽기·쓰기가 막혀 있고, Edge Function만 접근합니다.
- 통계 API는 숫자만 돌려주고 설치 ID나 개별 기록은 내보내지 않습니다.

## 앱 설치

1. `ADyson-v0.6-server.apk`를 폰으로 옮겨 설치합니다. ("출처를 알 수 없는 앱" 허용 필요)
2. 원본(서버 미연결) 버전이 깔려 있으면 서명이 달라서 먼저 삭제해야 합니다.

> 이 APK는 원본 v0.6에 서버 주소(`Stats.ENDPOINT`)와 인터넷 권한만 추가해 다시 서명한 것입니다.
> 서명 키는 레포에 넣지 않습니다. 같은 키로 서명해야 덮어 설치가 되니 키는 따로 보관하세요.

## 통계 페이지

배포 주소: **https://teamjegal.github.io/Money/adsms/** (`main`에 푸시하면 자동 배포)

로컬에서 볼 때:

```bash
python -m http.server 5173 --directory adsms/web
```

브라우저에서 http://localhost:5173 을 엽니다.
