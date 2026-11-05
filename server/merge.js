// 같은 회사가 여러 도메인으로 보내는 경우 하나로 합치기
// (예: facebookmail.com + facebook.com → Facebook). 키는 LLM이 정한 서비스명, 규칙 모드면 발신자 이름.
const { GENERIC_NAMES, normName } = require('./domains');
const { signalsOf } = require('./mbox');

const RISK_RANK = { high: 3, medium: 2, low: 1, review: 0 };
const ACCOUNT_SIGNALS = ['signup', 'privacy', 'order', 'dormant', 'security'];
const maxStr = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
const minStr = (a, b) => (!a ? b : !b ? a : a < b ? a : b);

// 묶음 키: 기관은 합치지 않음, 흔한 이름(noreply 등)도 합치지 않음
function keyOf(group, judged) {
  if (group.kind === 'institution') return `d:${group.domain}`;
  const name = judged.by === 'llm' ? judged.service : group.name;
  const k = normName(name);
  if (!k || k.length < 2 || GENERIC_NAMES.test(String(name).trim())) return `d:${group.domain}`;
  return `s:${k}`;
}

function combine(a, b) {
  const big = a.count >= b.count ? a : b;
  const counts = { ...a.counts };
  for (const [t, n] of Object.entries(b.counts)) counts[t] = (counts[t] || 0) + n;
  const newer = maxStr(a.last_seen, b.last_seen) === a.last_seen ? a : b;
  const count = a.count + b.count;
  return {
    ...big,
    domains: [...a.domains, ...b.domains],
    count,
    counts,
    first_seen: minStr(a.first_seen, b.first_seen),
    last_seen: maxStr(a.last_seen, b.last_seen),
    last_ad: maxStr(a.last_ad, b.last_ad),
    last_order: maxStr(a.last_order, b.last_order),
    last_dormant: maxStr(a.last_dormant, b.last_dormant),
    subjects: [...new Set([...a.subjects, ...b.subjects])].slice(0, 8),
    unsubscribe: (newer.unsubscribe && newer) ? newer.unsubscribe : a.unsubscribe || b.unsubscribe,
    unsubscribe_one_click: newer.unsubscribe ? newer.unsubscribe_one_click : a.unsubscribe_one_click || b.unsubscribe_one_click,
    contact_email: a.contact_email || b.contact_email,
    signals: signalsOf(counts),
    weak: count <= 2 && !ACCOUNT_SIGNALS.some((t) => counts[t]),
  };
}

// groups[i] 와 judged[i] 는 짝. 합친 결과도 [{ group, judged }] 로 돌려준다.
// 판단은 가장 위험도가 높은 쪽, 같으면 메일이 많은 쪽을 따른다.
function mergeByService(groups, judged) {
  const buckets = new Map();
  groups.forEach((g, i) => {
    const k = keyOf(g, judged[i]);
    const cur = buckets.get(k);
    if (!cur) return buckets.set(k, { group: g, judged: judged[i] });
    const pickNew = RISK_RANK[judged[i].risk] > RISK_RANK[cur.judged.risk]
      || (RISK_RANK[judged[i].risk] === RISK_RANK[cur.judged.risk] && g.count > cur.group.count);
    buckets.set(k, { group: combine(cur.group, g), judged: pickNew ? judged[i] : cur.judged });
  });
  return [...buckets.values()];
}

module.exports = { mergeByService, keyOf };
