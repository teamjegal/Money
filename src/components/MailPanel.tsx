import { useState } from 'react';
import { analyzeFiles, analyzePastedText, type MailScanResult } from '../lib/analyzeMail';

const GMAIL_QUERY =
  'subject:(결제 OR 영수증 OR 구독 OR 정기결제 OR 갱신 OR 무료체험 OR receipt OR subscription OR invoice) newer_than:1y';

interface Props {
  result: MailScanResult | null;
  onResult: (r: MailScanResult) => void;
}

export function MailPanel({ result, onResult }: Props) {
  const [progress, setProgress] = useState<{ ratio: number; scanned: number } | null>(null);
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setProgress({ ratio: 0, scanned: 0 });
    const r = await analyzeFiles([...list], (ratio, scanned) => setProgress({ ratio, scanned }));
    setProgress(null);
    onResult(r);
  }

  async function copyQuery() {
    try {
      await navigator.clipboard.writeText(GMAIL_QUERY);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 권한이 없으면 사용자가 직접 복사 */
    }
  }

  return (
    <section className="panel">
      <h2>① 메일에서 결제·구독 흔적 찾기</h2>
      <p className="muted">메일은 이 브라우저 안에서만 읽고, 어디에도 전송하지 않아요.</p>

      <label
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <input type="file" accept=".mbox,.eml,.txt" multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
        <strong>.mbox / .eml 파일을 끌어다 놓거나 클릭해서 선택</strong>
        <span className="muted">Gmail Takeout(.mbox), 네이버 메일 백업(.eml) 지원 · 큰 파일도 OK</span>
      </label>

      {progress && (
        <div className="progress" role="status">
          <div className="bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          <span>{progress.scanned.toLocaleString()}통 읽는 중…</span>
        </div>
      )}

      <div className="or">또는</div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={'메일함 검색 결과 목록을 복사해서 붙여넣거나, 메일 "원문 보기" 내용을 붙여넣으세요.\n예) 넷플릭스  결제가 완료되었습니다 ₩13,500  2026.10.03'}
      />
      <div className="row">
        <button className="primary" disabled={!text.trim()} onClick={() => onResult(analyzePastedText(text))}>
          붙여넣은 내용 분석
        </button>
        {result && (
          <span className="muted">
            {result.scanned.toLocaleString()}통 중 <b>{result.hits.length}</b>건에서 구독 신호를 찾았어요
          </span>
        )}
      </div>

      <details className="howto">
        <summary>메일을 어떻게 가져오나요?</summary>
        <ol>
          <li>
            <b>Gmail 목록 붙여넣기 (1분)</b> — Gmail 검색창에 아래 검색어를 넣고, 결과 목록을 드래그해서 복사 → 위 칸에 붙여넣기
            <div className="query">
              <code>{GMAIL_QUERY}</code>
              <button onClick={() => void copyQuery()}>{copied ? '복사됨' : '복사'}</button>
            </div>
          </li>
          <li>
            <b>Gmail 전체 분석 (.mbox)</b> —{' '}
            <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
              Google Takeout
            </a>
            에서 "메일"만 선택해 내보내기. 준비에 몇 시간~며칠 걸릴 수 있어요.
          </li>
          <li>
            <b>네이버 메일 (.eml)</b> — 메일 선택 → 더보기 → "PC에 저장"으로 받은 파일을 그대로 올리기
          </li>
        </ol>
      </details>
    </section>
  );
}
