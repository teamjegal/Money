// Express 서버: 정적 파일(web, demo-shop) + API 라우트
require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// 메일 텍스트(.mbox)가 클 수 있어서 넉넉하게
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ limit: '20mb', type: ['text/*', 'application/mbox'] }));

// 정적 파일
app.use('/demo-shop', express.static(path.join(ROOT, 'demo-shop')));
app.use('/', express.static(path.join(ROOT, 'web')));

// ---- API (지금은 더미 응답) ----

// 메일 분석 → 서비스 목록
app.post('/api/analyze', (req, res) => {
  res.json([]);
});

// 설정 페이지 컨트롤 → 해제 대상
app.post('/api/pick-targets', (req, res) => {
  res.json({ targets: [], save_id: null });
});

// 개인정보 삭제 요청 메일 초안
app.post('/api/deletion-email', (req, res) => {
  res.json({ subject: '', body: '' });
});

app.listen(PORT, () => {
  console.log(`동의 클리너 서버 실행 중: http://localhost:${PORT}`);
  console.log(`데모 쇼핑몰: http://localhost:${PORT}/demo-shop/`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY 없음 → 키워드 규칙 기반 대체 로직으로 동작합니다.');
  }
});
