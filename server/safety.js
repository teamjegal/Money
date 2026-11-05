// 안전 필터: LLM 판단과 무관하게 절대 클릭 후보가 되면 안 되는 요소 (CLAUDE.md 핵심 원칙 3)
// 확장 background.js 에도 같은 규칙이 있다. 둘 다 고칠 것.
const DANGER = /탈퇴|삭제|해지|결제|구매|비밀번호|로그아웃|withdraw|unregister|delete|remove.?account|log.?out|sign.?out|payment|purchase|password/i;

const isDangerous = (control) => DANGER.test(`${control.label || ''} ${control.href || ''}`);

module.exports = { DANGER, isDangerous };
