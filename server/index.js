// Express 서버: 정적 파일(web, demo-shop) + API 라우트
require('dotenv').config();
const path = require('path');
const express = require('express');
const { analyzeMailText } = require('./mbox');
const { classifyGroups } = require('./llm');
const { pickTargets } = require('./pick');
const gmail = require('./gmail');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// 메일 텍스트(.mbox)가 클 수 있어서 넉넉하게
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ limit: '20mb', type: ['text/*', 'application/mbox'] }));

// 정적 파일
app.use('/demo-shop', express.static(path.join(ROOT, 'demo-shop')));
app.use('/samples', express.static(path.join(ROOT, 'samples'))); // [샘플 메일함으로 해보기] 용
app.use('/', express.static(path.join(ROOT, 'web')));

// ---- Gmail 연결: /auth/google, /oauth2callback, /api/gmail/*, /api/analyze-gmail ----
app.use(gmail.router);

// ---- API ----

// 메일 분석 → 서비스 목록 (위험도순 배열)
// body: text/plain 원문, 또는 JSON { text: "..." }
// 판단 방식은 응답 헤더 X-Analysis-Mode (llm | rules | rules-fallback | mixed)
app.post('/api/analyze', async (req, res) => {
  const text = typeof req.body === 'string' ? req.body : req.body?.text || req.body?.mbox || '';
  if (!text.trim()) return res.status(400).json({ error: '메일 텍스트가 비어 있습니다.' });
  try {
    const { groups } = await analyzeMailText(text);
    const result = await classifyGroups(groups);
    res.set('X-Analysis-Mode', result.mode);
    res.json(result.items);
  } catch (e) {
    console.error('[analyze] 실패:', e);
    res.status(500).json({ error: '분석 중 오류가 발생했습니다.' });
  }
});

// 설정 페이지 컨트롤 → 해제 대상 (클릭은 확장이 사용자 승인 후에)
// 판단 방식은 응답 헤더 X-Pick-Mode (llm | rules | rules-fallback)
app.post('/api/pick-targets', async (req, res) => {
  const { url, controls } = req.body || {};
  if (!Array.isArray(controls)) return res.status(400).json({ error: 'controls 배열이 필요합니다.' });
  try {
    const { mode, targets, save_id } = await pickTargets({ url, controls });
    console.log(`[pick-targets] ${mode}: 대상 ${targets.length}개, 저장 ${save_id}`);
    res.set('X-Pick-Mode', mode);
    res.json({ targets, save_id });
  } catch (e) {
    console.error('[pick-targets] 실패:', e);
    res.status(500).json({ error: '해제 대상 선택 중 오류가 발생했습니다.' });
  }
});

// 개인정보 삭제 요청 메일 초안
app.post('/api/deletion-email', (req, res) => {
  res.json({ subject: '', body: '' });
});

app.listen(PORT, () => {
  console.log(`동의 클리너 서버 실행 중: http://localhost:${PORT}`);
  console.log(`데모 쇼핑몰: http://localhost:${PORT}/demo-shop/`);
  console.log(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? 'Gmail 연결 준비됨 (읽기 전용)'
    : 'GOOGLE_CLIENT_ID/SECRET 없음 → [Gmail로 분석하기] 비활성, .mbox 업로드만 가능');
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY 없음 → 키워드 규칙 기반 대체 로직으로 동작합니다.');
  }
});
