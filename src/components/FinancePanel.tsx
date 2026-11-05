import { useState } from 'react';
import { loadSet, saveSet } from '../lib/storage';

/**
 * 금융 쪽은 직접 연동하지 않고 공식 사이트로 안내만 한다.
 * (본인인증·금융인증서가 필요해서 웹사이트 하나로는 대신해줄 수 없다)
 */
const CHECKS = [
  {
    id: 'auto-transfer',
    title: '계좌 자동이체 정리',
    where: '어카운트인포 · 계좌자동이체 통합관리',
    href: 'https://www.payinfo.or.kr',
    desc: '내 모든 은행 계좌에 걸린 자동이체(통신비, 보험, 후원 등)를 한 번에 보고 바로 해지할 수 있어요.',
    tip: '해지는 영업일 09:00~22:00에 가능 · 공동/금융인증서 필요',
  },
  {
    id: 'card-auto-pay',
    title: '카드 자동납부 정리',
    where: '어카운트인포 · 카드자동납부 통합관리',
    href: 'https://www.payinfo.or.kr',
    desc: '카드에 등록된 정기결제(구독, 통신비, 렌탈 등)를 카드사 상관없이 조회·해지해요.',
    tip: '메일에 안 잡힌 구독이 여기서 많이 나와요',
  },
  {
    id: 'my-cards',
    title: '안 쓰는 카드·숨은 계좌 찾기',
    where: '어카운트인포 · 내카드한눈에 / 내계좌한눈에',
    href: 'https://www.payinfo.or.kr',
    desc: '연회비만 나가는 휴면 카드, 잔액이 남은 잊힌 계좌를 찾아 해지하거나 잔고를 옮겨요.',
    tip: '카드 포인트 현금화도 같은 곳에서 가능',
  },
  {
    id: 'do-not-call',
    title: '금융권 광고 전화·문자 차단',
    where: '두낫콜 (금융권 연락중지청구)',
    href: 'https://www.donotcall.or.kr',
    desc: '은행·카드·보험사의 마케팅 전화와 문자를 한 번에 거부해요. 대출·보험 권유 전화가 줄어요.',
    tip: '반영까지 최대 2주 · 문의 02-3705-5000',
  },
];

export function FinancePanel() {
  const [done, setDone] = useState(() => loadSet('finance-done'));

  function toggle(id: string) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    saveSet('finance-done', next);
  }

  return (
    <section className="panel">
      <h2>③ 금융 자동결제 점검</h2>
      <p className="muted">금융 정보는 본인인증이 필요해서 공식 사이트에서 직접 확인해요. 다 했으면 체크!</p>
      <ul className="finance">
        {CHECKS.map((c) => (
          <li key={c.id} className={done.has(c.id) ? 'done' : ''}>
            <label className="check">
              <input type="checkbox" checked={done.has(c.id)} onChange={() => toggle(c.id)} />
              <span>
                <b>{c.title}</b>
                <small>{c.where}</small>
              </span>
            </label>
            <p>{c.desc}</p>
            <div className="row">
              <a className="button" href={c.href} target="_blank" rel="noreferrer">
                바로가기 ↗
              </a>
              <small className="muted">{c.tip}</small>
            </div>
          </li>
        ))}
      </ul>
      <p className="progress-text">
        {done.size} / {CHECKS.length} 완료
      </p>
    </section>
  );
}
