import { useState } from 'react';
import VoiceNarrationApp from './VoiceNarrationApp';
import ListeningRoom from './ListeningRoom';
import { COLORS, FONT_MONO, GLOBAL_KEYFRAMES } from './theme';

import V1VoiceNarrationApp from './v1/VoiceNarrationApp';
import V1ListeningRoom from './v1/ListeningRoom';
import { COLORS as V1_COLORS, FONT_MONO as V1_FONT_MONO, GLOBAL_KEYFRAMES as V1_GLOBAL_KEYFRAMES } from './v1/theme';

import ExperienceX from './vx/Experience';
import { GLOBAL_KEYFRAMES as VX_GLOBAL_KEYFRAMES } from './vx/theme';

// 公開ページ(GitHub Pages)ではバックエンドがなく記憶帳系タブは動かないため、試聴室を初期表示にする
const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

const VERSIONS = [
  { key: 'v1', label: 'V1' },
  { key: 'v2', label: 'V2' },
  { key: 'x', label: 'X' },
];

// 常に右上に浮かぶバージョン切替。デザインバージョンを見比べるための入口。
function VersionSwitcher({ version, onChange }) {
  return (
    <div style={switcherStyles.wrap}>
      {VERSIONS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          style={{
            ...switcherStyles.btn,
            ...(version === v.key ? switcherStyles.btnActive : null),
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

const switcherStyles = {
  wrap: {
    position: 'fixed', top: 12, right: 12, zIndex: 100,
    display: 'flex', gap: 3, background: 'rgba(10,10,14,0.72)',
    border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999,
    padding: 3, backdropFilter: 'blur(6px)',
  },
  btn: {
    border: 'none', cursor: 'pointer', borderRadius: 999,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700,
    letterSpacing: '0.04em', padding: '5px 11px',
    background: 'transparent', color: 'rgba(255,255,255,0.5)',
  },
  btnActive: { background: '#fff', color: '#0A0A14' },
};

// ----- V1: 紙とテープの懐古(最初のデザイン) -----
function StationTabV1({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      border: 'none', background: 'none', fontFamily: V1_FONT_MONO, fontSize: 12,
      letterSpacing: '0.04em', fontWeight: active ? 700 : 500,
      color: active ? V1_COLORS.amber : V1_COLORS.inkSoft,
      borderBottom: active ? `2px solid ${V1_COLORS.amber}` : '2px solid transparent',
      padding: '12px 4px 10px', cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}

function AppV1() {
  const [page, setPage] = useState(isStaticHost ? 'listen' : 'app');
  return (
    <div>
      <style>{V1_GLOBAL_KEYFRAMES}</style>
      <nav style={{
        background: V1_COLORS.paperDeep, borderBottom: `1px solid ${V1_COLORS.hairline}`,
        display: 'flex', gap: 26, justifyContent: 'center',
      }}>
        <StationTabV1 label="記憶帳" active={page === 'app'} onClick={() => setPage('app')} />
        <StationTabV1 label="試聴室" active={page === 'listen'} onClick={() => setPage('listen')} />
      </nav>
      {page === 'app' ? <V1VoiceNarrationApp /> : <V1ListeningRoom />}
    </div>
  );
}

// ----- V2: 暗闇でスペクトルの光として声を読み取る観測ステーション(現行デザイン) -----
function StationTabV2({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
        border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 11.5,
        fontWeight: 700, letterSpacing: '0.14em', padding: '9px 16px', borderRadius: 3,
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

function AppV2() {
  const [page, setPage] = useState(isStaticHost ? 'listen' : 'app');
  return (
    <div>
      <style>{GLOBAL_KEYFRAMES}</style>
      <nav style={{
        background: COLORS.void, borderBottom: `1px solid ${COLORS.line}`,
        display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
        padding: '10px 12px', position: 'sticky', top: 0, zIndex: 40,
      }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.2em', color: COLORS.mistFaint, marginRight: 6, whiteSpace: 'nowrap' }}>CH</span>
        <StationTabV2 label="記憶帳" active={page === 'app'} onClick={() => setPage('app')} />
        <StationTabV2 label="試聴室" active={page === 'listen'} onClick={() => setPage('listen')} />
      </nav>
      {page === 'app' ? <VoiceNarrationApp /> : <ListeningRoom />}
    </div>
  );
}

// ----- X: 声の劇場(構造そのものを作り替えた新UI/UX) -----
function AppX() {
  return (
    <div>
      <style>{VX_GLOBAL_KEYFRAMES}</style>
      <ExperienceX />
    </div>
  );
}

export default function App() {
  const [version, setVersion] = useState(isStaticHost ? 'v2' : 'x');
  return (
    <div>
      <VersionSwitcher version={version} onChange={setVersion} />
      {version === 'v1' && <AppV1 />}
      {version === 'v2' && <AppV2 />}
      {version === 'x' && <AppX />}
    </div>
  );
}
