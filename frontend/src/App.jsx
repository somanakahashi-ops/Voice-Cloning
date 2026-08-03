import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';
import { COLORS, FONT_MONO, GLOBAL_KEYFRAMES } from './theme';

const tabStyle = (active) => ({
  border: 'none',
  background: 'none',
  fontFamily: FONT_MONO,
  fontSize: 12,
  letterSpacing: '0.04em',
  fontWeight: active ? 700 : 500,
  color: active ? COLORS.amber : COLORS.inkSoft,
  borderBottom: active ? `2px solid ${COLORS.amber}` : '2px solid transparent',
  padding: '12px 4px 10px',
  cursor: 'pointer',
});

// 公開ページ(GitHub Pages)ではバックエンドがなく記憶帳タブは動かないため、試聴室を初期表示にする
const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

export default function App() {
  const [page, setPage] = useState(isStaticHost ? 'listen' : 'app');
  return (
    <div>
      <style>{GLOBAL_KEYFRAMES}</style>
      <nav
        style={{
          background: COLORS.paperDeep,
          borderBottom: `1px solid ${COLORS.hairline}`,
          display: 'flex',
          gap: 26,
          justifyContent: 'center',
        }}
      >
        <button style={tabStyle(page === 'app')} onClick={() => setPage('app')}>記憶帳</button>
        <button style={tabStyle(page === 'listen')} onClick={() => setPage('listen')}>試聴室</button>
      </nav>
      {page === 'app' ? <VoiceNarrationApp /> : <ListeningRoom />}
    </div>
  );
}
