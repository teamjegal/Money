import { CATEGORY_LABEL } from '../data/services';
import { summarize } from '../lib/findings';
import type { Finding, FindingStatus, Source } from '../types';

const STATUS: Record<FindingStatus, { label: string; tone: string }> = {
  paid: { label: '결제 중', tone: 'danger' },
  trial: { label: '무료체험', tone: 'warn' },
  'maybe-paid': { label: '유료일 수도', tone: 'warn' },
  'account-only': { label: '계정만 있음', tone: 'neutral' },
  canceled: { label: '해지됨', tone: 'ok' },
};

const SOURCE_LABEL: Record<Source, string> = { mail: '메일', kakao: '카카오', naver: '네이버' };

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

interface Props {
  findings: Finding[];
  done: Set<string>;
  onToggleDone: (key: string) => void;
  onGoInput: () => void;
}

export function ResultPanel({ findings, done, onToggleDone, onGoInput }: Props) {
  if (findings.length === 0) {
    return (
      <section className="panel empty">
        <h2>아직 결과가 없어요</h2>
        <p className="muted">메일이나 연결된 서비스 목록을 넣으면 여기에 정리돼요.</p>
        <button className="primary" onClick={onGoInput}>
          데이터 넣으러 가기
        </button>
      </section>
    );
  }

  const s = summarize(findings);
  const saved = findings
    .filter((f) => done.has(f.key) && f.status !== 'canceled')
    .reduce((n, f) => n + (f.monthlyKRW ?? 0), 0);

  return (
    <section className="panel">
      <div className="stats">
        <div className="stat">
          <small>찾은 서비스</small>
          <b>{s.total}개</b>
        </div>
        <div className="stat">
          <small>확인된 월 구독료</small>
          <b>{won(s.confirmedMonthly)}</b>
          <small className="muted">{s.paidCount}개 서비스</small>
        </div>
        <div className="stat">
          <small>유료일 수도 있는 것</small>
          <b>+{won(s.possibleMonthly)}</b>
          <small className="muted">참고가 기준 추정</small>
        </div>
        <div className="stat accent">
          <small>정리해서 아낀 돈 (연)</small>
          <b>{won(saved * 12)}</b>
        </div>
      </div>

      <ul className="findings">
        {findings.map((f) => {
          const st = STATUS[f.status];
          return (
            <li key={f.key} className={done.has(f.key) ? 'done' : ''}>
              <label className="check">
                <input type="checkbox" checked={done.has(f.key)} onChange={() => onToggleDone(f.key)} aria-label={`${f.name} 정리 완료`} />
              </label>
              <div className="main">
                <div className="title">
                  <b>{f.name}</b>
                  <span className={`badge ${st.tone}`}>{st.label}</span>
                  {f.service && <span className="badge neutral">{CATEGORY_LABEL[f.service.category]}</span>}
                </div>
                <div className="meta">
                  {f.sources.map((src) => SOURCE_LABEL[src]).join(' · ')}에서 발견
                  {f.lastCharge?.date && ` · 최근 결제 ${f.lastCharge.date.toLocaleDateString('ko-KR')}`}
                  {f.cadence && ` · ${f.cadence === 'monthly' ? '매월' : '매년'}`}
                  {f.hits[0] && ` · "${f.hits[0].subject.slice(0, 40)}"`}
                </div>
              </div>
              <div className="price">
                {f.monthlyKRW !== undefined && (
                  <>
                    <b>{won(f.monthlyKRW)}</b>
                    <small>/월{f.estimated ? ' (추정)' : ''}</small>
                  </>
                )}
              </div>
              {f.service?.manageUrl && f.status !== 'canceled' && (
                <a className="button" href={f.service.manageUrl} target="_blank" rel="noreferrer">
                  {f.status === 'account-only' ? '관리' : '해지하기'} ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
