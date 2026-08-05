import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';
import { COLORS, FONT_MONO, GLOBAL_KEYFRAMES } from './theme';

// 観測ステーションのチャンネル切替。選択中のタブだけスペクトルの光が灯る。
function StationTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        border: 'none',
        cursor: 'pointer',
        fontFamily: FONT_MONO,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        padding: '9px 16px',
        borderRadius: 3,
        color: active ? COLORS.mist : COLORS.mistFaint,
        background: active ? COLORS.panelRaised : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${COLORS.lineBright}` : 'none',
        transition: 'all 0.18s ease',
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? COLORS.spectral2 : COLORS.mistFaint,
        boxShadow: active ? `0 0 6px ${COLORS.spectral2}` : 'none',
        flexShrink: 0,
      }} />
      {label}
    </button>
  );
}

// 公開ページ(GitHub Pages)ではバックエンドがなく記憶帳タブは動かないため、試聴室を初期表示にする
const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

export default function App() {
  const [page, setPage] = useState(isStaticHost ? 'listen' : 'app');
  return (
    <div>
      <style>{GLOBAL_KEYFRAMES}</style>
      <nav
        style={{
          background: COLORS.void,
          borderBottom: `1px solid ${COLORS.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
          padding: '10px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <span style={{
          fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.2em',
          color: COLORS.mistFaint, marginRight: 6, whiteSpace: 'nowrap',
        }}>
          CH
        </span>
        <StationTab label="記憶帳" active={page === 'app'} onClick={() => setPage('app')} />
        <StationTab label="試聴室" active={page === 'listen'} onClick={() => setPage('listen')} />
      </nav>
      {page === 'app' ? <VoiceNarrationApp /> : <ListeningRoom />}
    </div>
  );
}
