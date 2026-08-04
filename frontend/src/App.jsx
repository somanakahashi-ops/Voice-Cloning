import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';
import { COLORS, FONT_MONO, GLOBAL_KEYFRAMES } from './theme';

// デッキの物理トグルスイッチ風タブ。「押し込まれている方が選択中」の
// メタファーで、単なる下線タブより機材らしい手触りを出す。
function DeckTab({ label, active, onClick }) {
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
        color: active ? COLORS.deck : 'rgba(243,238,227,0.55)',
        background: active
          ? `linear-gradient(180deg, ${COLORS.brassBright} 0%, ${COLORS.brass} 100%)`
          : 'rgba(243,238,227,0.05)',
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.4)'
          : 'inset 0 1px 2px rgba(0,0,0,0.5)',
        transition: 'all 0.18s ease',
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? COLORS.deck : 'rgba(243,238,227,0.3)',
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
          background: `linear-gradient(180deg, ${COLORS.deckPanel} 0%, ${COLORS.deck} 100%)`,
          borderBottom: `1px solid ${COLORS.brassDeep}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
          padding: '10px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        }}
      >
        <span style={{
          fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.2em',
          color: 'rgba(243,238,227,0.35)', marginRight: 6, whiteSpace: 'nowrap',
        }}>
          SRC
        </span>
        <DeckTab label="記憶帳" active={page === 'app'} onClick={() => setPage('app')} />
        <DeckTab label="試聴室" active={page === 'listen'} onClick={() => setPage('listen')} />
      </nav>
      {page === 'app' ? <VoiceNarrationApp /> : <ListeningRoom />}
    </div>
  );
}
