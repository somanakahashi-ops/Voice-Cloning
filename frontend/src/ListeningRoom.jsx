import { useEffect, useState } from 'react';
import { API_BASE } from './VoiceNarrationApp';

// 聴き比べ音声(backend/storage/compare)の既知ファイルの表示情報。
// 未知のファイルはファイル名のまま末尾に表示される。
const COMPARE_INFO = {
  'irodori_version.wav': {
    title: 'Irodori ワンショット — 冒頭2文',
    note: 'テキスト+声紋Aの参照音声から直接生成(採用方式)',
    adopted: true,
  },
  'aivis_version.wav': {
    title: 'AivisSpeech 2段階 — 冒頭2文',
    note: 'AivisSpeech(話者まお)で下書き → KokoCloneで声紋Aへ変換',
  },
  'irodori_version_full.wav': {
    title: 'Irodori ワンショット — 第一章フル',
    note: '前半・後半を分割生成して結合(採用方式)',
    adopted: true,
  },
  'aivis_version_full.wav': {
    title: 'AivisSpeech 2段階 — 第一章フル',
    note: 'AivisSpeech(話者まお)で下書き → KokoCloneで声紋Aへ変換',
  },
  'aivis_draft.wav': {
    title: 'AivisSpeech下書き — 冒頭2文(変換前)',
    note: '声質変換前の素のTTS音声(話者まお)。比較の参考用',
  },
  'aivis_draft_full.wav': {
    title: 'AivisSpeech下書き — 第一章フル(変換前)',
    note: '声質変換前の素のTTS音声(話者まお)。比較の参考用',
  },
};
const COMPARE_ORDER = Object.keys(COMPARE_INFO);

function sortCompare(items) {
  return [...items].sort((a, b) => {
    const ia = COMPARE_ORDER.indexOf(a.name);
    const ib = COMPARE_ORDER.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function AudioCard({ title, note, seconds, url, adopted }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.cardTitle}>{title}</span>
        {adopted && <span style={styles.adoptedBadge}>採用</span>}
        {seconds != null && <span style={styles.cardMeta}>{seconds}秒</span>}
      </div>
      {note && <p style={styles.cardNote}>{note}</p>}
      <audio controls preload="none" src={`${API_BASE}${url}`} style={{ width: '100%' }} />
    </div>
  );
}

export default function ListeningRoom() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/listening`)
      .then((res) => {
        if (!res.ok) throw new Error(`リクエストに失敗しました(${res.status})`);
        return res.json();
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => {
        if (!cancelled) {
          setError('バックエンドに接続できません。試聴はローカルでAPIサーバー(uvicorn)を起動している場合のみ可能です。');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const compare = data ? sortCompare(data.compare) : [];
  const final = data ? data.final : [];

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.inner}>
          <div style={styles.eyebrow}>LISTENING ROOM</div>
          <h1 style={styles.title}>試聴室</h1>
          <p style={styles.lead}>
            生成・変換した音声をブラウザで聴けます。本人録音の下書きは非公開領域にあり、ここには含まれません。
          </p>
        </div>
      </header>

      <main style={{ ...styles.inner, padding: '28px 20px 0' }}>
        {error && <div style={styles.connectionError}>{error}</div>}
        {!error && !data && <p style={styles.loading}>読み込み中…</p>}

        {data && (
          <>
            <section>
              <h2 style={styles.sectionTitle}>経路Bの方式聴き比べ</h2>
              <p style={styles.sectionNote}>
                同一テキスト(第一章)・同一声紋Aで、TTS方式だけを変えた比較です。
              </p>
              {compare.length === 0 && <p style={styles.empty}>聴き比べ音声はまだありません。</p>}
              {compare.map((item) => {
                const info = COMPARE_INFO[item.name] || { title: item.name };
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
    background: '#EDE8DF',
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    color: '#2B2724',
    paddingBottom: 80,
  },
  header: {
    borderBottom: '1px solid #D8D0C0',
    padding: '40px 20px 32px',
    background: 'linear-gradient(180deg, #F4F0E6 0%, #EDE8DF 100%)',
  },
  inner: { maxWidth: 720, margin: '0 auto' },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.18em',
    color: '#B8773D',
    fontWeight: 600,
    marginBottom: 8,
  },
  title: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 32,
    fontWeight: 700,
    margin: '0 0 8px',
    letterSpacing: '0.02em',
  },
  lead: { fontSize: 13, color: '#6B6356', lineHeight: 1.7, margin: 0 },
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
  loading: { fontSize: 13, color: '#8A8273' },
  sectionTitle: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 19,
    fontWeight: 700,
    margin: '0 0 6px',
  },
  sectionNote: { fontSize: 12.5, color: '#6B6356', lineHeight: 1.6, margin: '0 0 14px' },
  empty: { fontSize: 13, color: '#8A8273' },
  card: {
    background: '#F7F3EA',
    border: '1px solid #D8D0C0',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 12,
  },
  cardHead: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: 600 },
  adoptedBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    color: '#F7F3EA',
    background: '#B8773D',
    borderRadius: 999,
    padding: '2px 9px',
    letterSpacing: '0.08em',
  },
  cardMeta: { fontSize: 12, color: '#8A8273', marginLeft: 'auto' },
  cardNote: { fontSize: 12.5, color: '#6B6356', lineHeight: 1.6, margin: '0 0 10px' },
};
