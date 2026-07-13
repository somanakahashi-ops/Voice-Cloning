import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';

const tabStyle = (active) => ({
  border: 'none',
  background: 'none',
  fontFamily: "'Noto Sans JP', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  color: active ? '#B8773D' : '#6B6356',
  borderBottom: active ? '2px solid #B8773D' : '2px solid transparent',
  padding: '11px 4px 9px',
  cursor: 'pointer',
});

export default function App() {
  const [page, setPage] = useState('app');
  return (
    <div>
      <nav
        style={{
          background: '#F4F0E6',
          borderBottom: '1px solid #D8D0C0',
          display: 'flex',
          gap: 22,
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
