import { useEffect, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { API_BASE } from './VoiceNarrationApp';
import { COLORS, FONT_DISPLAY, FONT_MONO } from './theme';
import { Waveform } from './Waveform';

// 聴き比べ音声(backend/storage/compare)の既知ファイルの表示情報。
// キーは拡張子なしのファイル名(ローカルは.wav、公開ページは.mp3のため)。
// 未知のファイルはファイル名のまま末尾に表示される。
const COMPARE_INFO = {
  irodori_version: {
    title: 'Irodori ワンショット — 冒頭2文',
    note: 'テキスト+声紋Aの参照音声から直接生成(採用方式)',
    adopted: true,
  },
  aivis_version: {
    title: 'AivisSpeech 2段階 — 冒頭2文',
    note: 'AivisSpeech(話者まお)で下書き → KokoCloneで声紋Aへ変換',
  },
  irodori_version_full: {
    title: 'Irodori ワンショット — 第一章フル',
    note: '前半・後半を分割生成して結合(採用方式)',
    adopted: true,
  },
  aivis_version_full: {
    title: 'AivisSpeech 2段階 — 第一章フル',
    note: 'AivisSpeech(話者まお)で下書き → KokoCloneで声紋Aへ変換',
  },
  aivis_draft: {
    title: 'AivisSpeech下書き — 冒頭2文(変換前)',
    note: '声質変換前の素のTTS音声(話者まお)。比較の参考用',
  },
  aivis_draft_full: {
    title: 'AivisSpeech下書き — 第一章フル(変換前)',
    note: '声質変換前の素のTTS音声(話者まお)。比較の参考用',
  },
};
const COMPARE_ORDER = Object.keys(COMPARE_INFO);

function stemOf(name) {
  return name.replace(/\.[^.]+$/, '');
}

function sortCompare(items) {
  return [...items].sort((a, b) => {
    const ia = COMPARE_ORDER.indexOf(stemOf(a.name));
    const ib = COMPARE_ORDER.indexOf(stemOf(b.name));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

// カード自身が再生ボタンと波形を持つ、テープ+信号のミニプレイヤー。
// ブラウザ標準の<audio controls>は使わず、他カードのシグネチャーと統一する。
function AudioCard({ title, note, seconds, url, adopted }) {
  const [playing, setPlaying] = useState(false);
  // "/files/..."はバックエンド配信、"./listening/..."は公開ページ同梱の静的音声
  const src = url.startsWith('/') ? `${API_BASE}${url}` : url;
  const elId = `listen-${url}`;

  const toggle = () => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.currentTime = 0;
      el.play();
    }
  };

  return (
    <div className="vm-listen-card" style={styles.card}>
      <div style={styles.cardHead}>
        <button onClick={toggle} style={{ ...styles.playBtn, background: adopted ? COLORS.signal : COLORS.ink }}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <span style={styles.cardTitle}>{title}</span>
        {adopted && <span style={styles.adoptedBadge}>採用</span>}
        <span style={styles.cardSpacer} />
        <Waveform active={playing} size="sm" color={adopted ? COLORS.signal : COLORS.inkFaint} />
        {seconds != null && <span style={styles.cardMeta}>{seconds}s</span>}
      </div>
      {note && <p style={styles.cardNote}>{note}</p>}
      <audio
        id={elId}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        style={{ display: 'none' }}
      />
    </div>
  );
}

export default function ListeningRoom() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchJson = (url) => fetch(url).then((res) => {
      if (!res.ok) throw new Error(`リクエストに失敗しました(${res.status})`);
      return res.json();
    });
    // バックエンドがあればそこから、なければ(GitHub Pages等)同梱の静的マニフェストから読む
    fetchJson(`${API_BASE}/api/listening`)
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => fetchJson('./listening/manifest.json')
        .then((json) => {
          if (!cancelled) { setData(json); setStaticMode(true); }
        })
        .catch(() => {
          if (!cancelled) {
            setError('バックエンドに接続できません。試聴はローカルでAPIサーバー(uvicorn)を起動している場合のみ可能です。');
          }
        }));
    return () => { cancelled = true; };
  }, []);

  const compare = data ? sortCompare(data.compare) : [];
  const final = data ? data.final : [];

  return (
    <div style={styles.app}>
      <style>{`
        .vm-listen-card { transition: box-shadow 0.22s ease, border-color 0.22s ease, transform 0.22s ease; }
        .vm-listen-card:hover { box-shadow: 0 6px 18px rgba(42,36,30,0.1); border-color: ${COLORS.amber}; transform: translateY(-2px); }
      `}</style>
      <header style={styles.header}>
        <div style={styles.headerGrain} />
        <div style={styles.inner}>
          <div style={styles.eyebrow}>LISTENING ROOM — SIGNAL FROM THE PAST</div>
          <h1 style={styles.title}>試聴室</h1>
          <p style={styles.lead}>
            生成・変換した音声をブラウザで聴けます。本人録音の下書きは非公開領域にあり、ここには含まれません。
          </p>
          <div style={styles.heroWaveRow}>
            <Waveform active bars={40} size="lg" color={COLORS.signal} />
          </div>
        </div>
      </header>

      <main style={{ ...styles.inner, padding: '28px 20px 0' }}>
        {error && <div style={styles.connectionError}>{error}</div>}
        {!error && !data && <p style={styles.loading}>読み込み中…</p>}
        {staticMode && (
          <div style={styles.staticNote}>
            公開デモ版です。事前に生成した音声のみ掲載しています(生成機能はローカル環境で動作します)。
          </div>
        )}

        {data && (
          <>
            <section>
              <h2 style={styles.sectionTitle}>経路Bの方式聴き比べ</h2>
              <p style={styles.sectionNote}>
                同一テキスト(第一章)・同一声紋Aで、TTS方式だけを変えた比較です。
              </p>
              {compare.length === 0 && <p style={styles.empty}>聴き比べ音声はまだありません。</p>}
              {compare.map((item) => {
                const info = COMPARE_INFO[stemOf(item.name)] || { title: item.name };
                return <AudioCard key={item.name} {...info} seconds={item.seconds} url={item.url} />;
              })}
            </section>

            <section style={{ marginTop: 36 }}>
              <h2 style={styles.sectionTitle}>変換済みの章音声</h2>
              <p style={styles.sectionNote}>
                本人録音の下書きを各声紋へ声質変換した結果(変換後のみ試聴可)。
              </p>
              {final.length === 0 && <p style={styles.empty}>変換済み音声はまだありません。</p>}
              {final.map((item) => (
                <AudioCard
                  key={item.name}
                  title={item.label || item.name}
                  note={item.label ? item.name : null}
                  seconds={item.seconds}
                  url={item.url}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: COLORS.paper,
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    color: COLORS.ink,
    paddingBottom: 80,
  },
  header: {
    position: 'relative',
    overflow: 'hidden',
    padding: '56px 20px 40px',
    background: `radial-gradient(ellipse 900px 500px at 15% -10%, #34291d 0%, ${COLORS.ink} 55%)`,
  },
  headerGrain: {
    position: 'absolute',
    inset: 0,
    opacity: 0.5,
    pointerEvents: 'none',
    backgroundImage:
      'repeating-linear-gradient(115deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)',
  },
  inner: { maxWidth: 720, margin: '0 auto', position: 'relative' },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: '0.22em',
    color: COLORS.signal,
    fontWeight: 600,
    marginBottom: 14,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 'clamp(38px, 7vw, 56px)',
    fontWeight: 700,
    color: COLORS.paper,
    margin: '0 0 12px',
    letterSpacing: '0.02em',
    lineHeight: 1.15,
  },
  lead: { fontSize: 14.5, color: 'rgba(243,238,227,0.72)', lineHeight: 1.7, margin: 0, maxWidth: 480 },
  heroWaveRow: {
    marginTop: 30,
    paddingTop: 20,
    borderTop: '1px solid rgba(243,238,227,0.12)',
    overflow: 'hidden',
  },
  connectionError: {
    background: '#F4D9D2',
    color: '#7A2E1F',
    border: '1px solid #D89A89',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 12.5,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  loading: { fontSize: 13, color: COLORS.inkSoft },
  staticNote: {
    background: COLORS.amberSoft,
    color: COLORS.amberDeep,
    border: `1px solid ${COLORS.amber}`,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 12.5,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 19,
    fontWeight: 700,
    margin: '0 0 6px',
  },
  sectionNote: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.6, margin: '0 0 14px' },
  empty: { fontSize: 13, color: COLORS.inkFaint },
  card: {
    background: COLORS.card,
    border: `1px solid ${COLORS.hairline}`,
    borderRadius: 12,
    padding: '13px 16px',
    marginBottom: 12,
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  playBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  cardTitle: { fontSize: 14, fontWeight: 600 },
  cardSpacer: { flex: 1 },
  adoptedBadge: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.card,
    background: COLORS.amber,
    borderRadius: 999,
    padding: '2px 9px',
    letterSpacing: '0.06em',
  },
  cardMeta: { fontFamily: FONT_MONO, fontSize: 11, color: COLORS.inkFaint },
  cardNote: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.6, margin: '6px 0 0 36px' },
};
