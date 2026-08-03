import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';
import { COLORS, FONT_MONO, GLOBAL_KEYFRAMES } from './theme';

const tabStyle = (active) => ({
  position: 'relative',
  border: 'none',
  background: 'none',
  fontFamily: FONT_MONO,
  fontSize: 12,
  letterSpacing: '0.14em',
  fontWeight: active ? 700 : 500,
  color: active ? COLORS.signal : 'rgba(243,238,227,0.55)',
  padding: '18px 4px 16px',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
});

const underlineStyle = (active) => ({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 2,
  background: active ? COLORS.signal : 'transparent',
  boxShadow: active ? `0 0 10px ${COLORS.signal}` : 'none',
  transition: 'all 0.25s ease',
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
          background: COLORS.ink,
          display: 'flex',
          gap: 30,
          justifyContent: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <button style={tabStyle(page === 'app')} onClick={() => setPage('app')}>
          記憶帳
          <span style={underlineStyle(page === 'app')} />
        </button>
        <button style={tabStyle(page === 'listen')} onClick={() => setPage('listen')}>
          試聴室
          <span style={underlineStyle(page === 'listen')} />
        </button>
      </nav>
      {page === 'app' ? <VoiceNarrationApp /> : <ListeningRoom />}
    </div>
  );
}
