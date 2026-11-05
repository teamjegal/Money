import { useMemo, useState } from 'react';
import { ConnectedPanel } from './components/ConnectedPanel';
import { FinancePanel } from './components/FinancePanel';
import { MailPanel } from './components/MailPanel';
import { ResultPanel } from './components/ResultPanel';
import { analyzeFiles, type MailScanResult } from './lib/analyzeMail';
import { parseConnectedText } from './lib/connected';
import { buildFindings } from './lib/findings';
import { loadSet, saveSet } from './lib/storage';
import type { ConnectedEntry } from './types';

type Tab = 'mail' | 'connected' | 'finance' | 'result';

const TABS: { id: Tab; label: string }[] = [
  { id: 'mail', label: '메일' },
  { id: 'connected', label: '연결된 서비스' },
  { id: 'finance', label: '금융 점검' },
  { id: 'result', label: '결과' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('mail');
  const [mail, setMail] = useState<MailScanResult | null>(null);
  const [kakao, setKakao] = useState<ConnectedEntry[]>([]);
  const [naver, setNaver] = useState<ConnectedEntry[]>([]);
  const [done, setDone] = useState(() => loadSet('done'));
  const [loadingSample, setLoadingSample] = useState(false);

  const findings = useMemo(() => buildFindings(mail?.hits ?? [], [...kakao, ...naver]), [mail, kakao, naver]);

  function toggleDone(key: string) {
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
    saveSet('done', next);
  }

  /** 발표·심사용: 샘플 데이터로 전체 흐름 체험 */
  async function loadSample() {
    setLoadingSample(true);
    try {
      const base = import.meta.env.BASE_URL;
      const [mbox, k, n] = await Promise.all([
        fetch(`${base}samples/sample.mbox`).then((r) => r.blob()),
        fetch(`${base}samples/kakao.txt`).then((r) => r.text()),
        fetch(`${base}samples/naver.txt`).then((r) => r.text()),
      ]);
      setMail(await analyzeFiles([new File([mbox], 'sample.mbox')], () => {}));
      setKakao(parseConnectedText(k, 'kakao'));
      setNaver(parseConnectedText(n, 'naver'));
      setTab('result');
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Money</h1>
          <p className="muted">잊고 있던 구독과 자동결제, 웹사이트 하나로 찾아서 정리하기</p>
        </div>
        <button onClick={() => void loadSample()} disabled={loadingSample}>
          {loadingSample ? '불러오는 중…' : '샘플로 체험하기'}
        </button>
      </header>

      <p className="privacy">🔒 서버가 없어요. 모든 분석은 이 브라우저 안에서만 이루어지고, 새로고침하면 사라져요.</p>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'result' && findings.length > 0 && <span className="count">{findings.length}</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'mail' && <MailPanel result={mail} onResult={(r) => setMail(r)} />}
        {tab === 'connected' && (
          <ConnectedPanel kakao={kakao} naver={naver} onChange={(src, e) => (src === 'kakao' ? setKakao(e) : setNaver(e))} />
        )}
        {tab === 'finance' && <FinancePanel />}
        {tab === 'result' && <ResultPanel findings={findings} done={done} onToggleDone={toggleDone} onGoInput={() => setTab('mail')} />}
      </main>

      {tab !== 'result' && findings.length > 0 && (
        <button className="primary floating" onClick={() => setTab('result')}>
          결과 보기 ({findings.length})
        </button>
      )}
    </div>
  );
}
