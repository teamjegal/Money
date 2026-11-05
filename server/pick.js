// 설정 페이지 컨트롤 → 해제 대상 고르기 (LLM, 실패 시 키워드 규칙)
const { getClient, textOf, MODEL } = require('./llm');
const { PICK_SYSTEM, buildPickUser, PICK_RETRY_HINT } = require('./prompts');
const { isDangerous } = require('./safety');

const MARKETING = /광고|마케팅|혜택|이벤트|맞춤형|프로모션|수신\s*동의|쿠폰|특가|뉴스레터/;
const ESSENTIAL = /주문|배송|결제|보안|공지|필수|거래/; // 정보성 필수 알림: 규칙·LLM 모두 제외
const REFUSE_OPTION = /거부|미동의|동의\s*안\s*함|받지\s*않/;
const SAVE = [[/^저장/, 4], [/저장/, 3], [/적용|변경/, 2], [/확인|완료/, 1]];
const isToggle = (c) => c.kind === 'checkbox' || c.kind === 'switch';
const isAction = (c) => c.kind === 'button' || c.kind === 'link';

// 컨트롤 하나가 해제 대상이 될 수 있는지 (LLM 결과 검증에도 사용)
function canTarget(c) {
  if (!c || c.disabled || isDangerous(c) || ESSENTIAL.test(c.label)) return false;
  if (isToggle(c)) return c.checked === true;
  if (c.kind === 'radio') return c.checked === false && REFUSE_OPTION.test(c.label);
  return false;
}
const canSave = (c) => !!c && isAction(c) && !c.disabled && !isDangerous(c) && !/취소|닫기/.test(c.label);

function reasonOf(label) {
  if (/맞춤형/.test(label)) return '맞춤형 광고 개인정보 이용';
  if (/야간/.test(label)) return '야간 광고 수신';
  const ch = ['푸시', '이메일', 'SMS', '문자', '카카오', '앱'].find((w) => label.includes(w));
  return ch ? `${ch} 광고·혜택 수신` : '광고·마케팅 수신 동의';
}

function pickByRules(controls) {
  const targets = controls
    .filter((c) => canTarget(c) && (c.kind === 'radio' || MARKETING.test(c.label)))
    .map((c) => ({ id: c.id, reason: reasonOf(c.label) }));
  let best = null, bestScore = 0;
  for (const c of controls.filter(canSave)) {
    const score = (SAVE.find(([re]) => re.test(c.label.trim())) || [null, 0])[1];
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return { targets, save_id: best ? best.id : null };
}

function parseJsonObject(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('JSON 객체 없음');
  const obj = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(obj.targets)) throw new Error('targets 배열 없음');
  return obj;
}

async function pickByLlm(client, url, controls) {
  const messages = [{ role: 'user', content: buildPickUser(url, controls) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: PICK_SYSTEM, messages,
    });
    const text = textOf(response);
    try {
      return parseJsonObject(text);
    } catch (e) {
      if (attempt === 1) throw e;
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: PICK_RETRY_HINT });
    }
  }
}

// LLM 결과를 그대로 믿지 않는다: 존재하는 id, 안전 필터, 상태 조건을 코드로 다시 확인
function sanitizePick(raw, byId) {
  const seen = new Set();
  const targets = (raw.targets || [])
    .filter((t) => t && byId.has(t.id) && canTarget(byId.get(t.id)) && !seen.has(t.id) && seen.add(t.id))
    .map((t) => ({ id: t.id, reason: typeof t.reason === 'string' && t.reason.trim() ? t.reason.trim().slice(0, 40) : reasonOf(byId.get(t.id).label) }));
  const save_id = canSave(byId.get(raw.save_id)) ? raw.save_id : null;
  return { targets, save_id };
}

// 진입점
async function pickTargets({ url = '', controls = [] }, opts = {}) {
  // 입력 정리 + 서버 쪽 안전 필터 (확장이 이미 걸렀어도 한 번 더)
  const safe = controls
    .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
    .map((c) => ({ id: c.id, kind: c.kind, label: c.label.slice(0, 120), checked: c.checked, disabled: !!c.disabled, href: c.href }))
    .filter((c) => !isDangerous(c));
  const byId = new Map(safe.map((c) => [c.id, c]));
  const forModel = safe.map(({ href, ...c }) => c);

  const rules = pickByRules(safe);
  const client = opts.client !== undefined ? opts.client : getClient();
  if (!client) return { mode: 'rules', ...rules };
  try {
    const picked = sanitizePick(await pickByLlm(client, url, forModel), byId);
    // LLM이 저장 버튼을 못 찾았으면 규칙 결과로 보충
    if (!picked.save_id) picked.save_id = rules.save_id;
    return { mode: 'llm', ...picked };
  } catch (e) {
    console.warn('[pick] LLM 실패 → 키워드 규칙 대체:', e.message);
    return { mode: 'rules-fallback', ...rules };
  }
}

module.exports = { pickTargets, pickByRules, canTarget };
