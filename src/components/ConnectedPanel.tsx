import { useState } from 'react';
import { parseConnectedText } from '../lib/connected';
import type { ConnectedEntry } from '../types';

const GUIDE = {
  kakao: {
    label: '카카오',
    steps: ['카카오톡 → 더보기(···) → 설정(⚙️)', '카카오계정 → 연결된 서비스 관리 → 전체보기', '목록 화면을 길게 눌러 전체 선택·복사 (PC는 드래그) → 아래에 붙여넣기'],
    link: { href: 'https://accounts.kakao.com', text: '카카오계정 (PC 웹)' },
  },
  naver: {
    label: '네이버',
    steps: ['네이버 로그인 → 네이버ID', '이력관리 → 연결된 서비스 관리 → 전체보기', '목록을 드래그해서 복사 → 아래에 붙여넣기'],
    link: { href: 'https://help.naver.com/service/5640/contents/19023?lang=ko', text: '네이버 고객센터 안내' },
  },
} as const;

interface Props {
  kakao: ConnectedEntry[];
  naver: ConnectedEntry[];
  onChange: (source: 'kakao' | 'naver', entries: ConnectedEntry[]) => void;
}

export function ConnectedPanel({ kakao, naver, onChange }: Props) {
  const [source, setSource] = useState<'kakao' | 'naver'>('kakao');
  const [text, setText] = useState({ kakao: '', naver: '' });
  const guide = GUIDE[source];
  const entries = source === 'kakao' ? kakao : naver;

  return (
    <section className="panel">
      <h2>② 소셜 로그인으로 가입한 서비스 찾기</h2>
      <p className="muted">"카카오로 시작하기", "네이버로 로그인"으로 가입하고 잊어버린 서비스를 찾아요.</p>

      <div className="segmented" role="tablist">
        {(['kakao', 'naver'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={source === s} onClick={() => setSource(s)}>
            {GUIDE[s].label} {(s === 'kakao' ? kakao : naver).length > 0 && <span className="count">{(s === 'kakao' ? kakao : naver).length}</span>}
          </button>
        ))}
      </div>

      <ol className="steps">
        {guide.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <a className="link" href={guide.link.href} target="_blank" rel="noreferrer">
        {guide.link.text} ↗
      </a>

      <textarea
        rows={8}
        value={text[source]}
        onChange={(e) => setText({ ...text, [source]: e.target.value })}
        placeholder={`${guide.label} 연결된 서비스 목록을 그대로 붙여넣으세요. 버튼 문구나 날짜가 섞여 있어도 괜찮아요.`}
      />
      <div className="row">
        <button className="primary" disabled={!text[source].trim()} onClick={() => onChange(source, parseConnectedText(text[source], source))}>
          목록 정리하기
        </button>
        {entries.length > 0 && <span className="muted">{entries.length}개 서비스를 찾았어요</span>}
      </div>

      {entries.length > 0 && (
        <ul className="chips">
          {entries.map((e) => (
            <li key={e.name} className={e.serviceId ? 'known' : ''} title={e.serviceId ? '유료 구독이 있는 서비스' : undefined}>
              {e.name}
              {e.date && <small>{e.date.toLocaleDateString('ko-KR')}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
