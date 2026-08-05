import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ArrowLeft, Settings2, Mic, Upload, Plus, Loader2, X } from 'lucide-react';
import {
  apiFetch, mapVoiceProfile, mapChapter,
  RecordModal, UploadModal, ChapterDraftModal,
  SignalReader, ChapterCard,
} from '../VoiceNarrationApp';
import { Waveform } from '../Waveform';
// 楽屋はV2の実績あるコンポーネント(SignalReader等)を流用しているため、
// そこへ渡す色キーだけはV2のパレットを使う(VXのgold/rose/blueを渡すとクラッシュする)
import { ERA_PALETTE as V2_ERA_PALETTE } from '../theme';
import { COLORS, ERA_COLORS, ERA_PALETTE, FONT_STAGE, FONT_BODY, FONT_MONO } from './theme';

// ============================================================
// バージョンX: 「声の劇場」
//
// これまでのダッシュボード(一覧+パネル)を捨て、暗闇の舞台に
// 声をひとりずつ招き入れる体験に作り替えた。常に見えているのは
// 「今、招いている声」と「今、演じている章」のどちらか一方だけ。
// 声紋ごとの色は照明ジェル(暖色金/薔薇色/寒色青)として舞台に灯る。
// ============================================================

export default function Experience() {
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState('troupe'); // 'troupe' | 'stage'
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [actIndex, setActIndex] = useState(0);
  const [backstageOpen, setBackstageOpen] = useState(false);

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [draftModalChapterId, setDraftModalChapterId] = useState(null);
  const [playingChapterId, setPlayingChapterId] = useState(null);
  const [playingProfileId, setPlayingProfileId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profilesRes, chaptersRes] = await Promise.all([
          apiFetch('/api/voice-profiles'),
          apiFetch('/api/chapters'),
        ]);
        if (cancelled) return;
        setVoiceProfiles(profilesRes.map(mapVoiceProfile));
        setChapters(chaptersRes.map(mapChapter));
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 生成中の章があれば完了まで定期的に状態を取得する(バックステージの編集を反映するため)
  useEffect(() => {
    const pendingIds = chapters
      .filter((c) => c.draftStatus === 'generating' || c.finalStatus === 'generating')
      .map((c) => c.id);
    if (pendingIds.length === 0) return;
    const interval = setInterval(async () => {
      for (const id of pendingIds) {
        try {
          const data = await apiFetch(`/api/chapters/${id}/status`);
          setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...mapChapter(data) } : c)));
        } catch {
          // ポーリング中の一時的な失敗は無視
        }
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [chapters]);

  const addVoiceProfile = async (data) => {
    const formData = new FormData();
    formData.append('label', data.label);
    if (data.eraTag) formData.append('era_tag', data.eraTag);
    formData.append('source_type', data.sourceType);
    const filePart = data.audioBlob || data.audioFile;
    const fileName = data.fileName || data.audioFile?.name || 'audio.wav';
    formData.append('audio', filePart, fileName);
    const created = await apiFetch('/api/voice-profiles', { method: 'POST', body: formData });
    setVoiceProfiles((prev) => [...prev, mapVoiceProfile(created)]);
    setShowRecordModal(false);
    setShowUploadModal(false);
  };

  const deleteVoiceProfile = async (id) => {
    try {
      await apiFetch(`/api/voice-profiles/${id}`, { method: 'DELETE' });
      setVoiceProfiles((prev) => prev.filter((p) => p.id !== id));
      setChapters((prev) => prev.map((c) => (c.voiceProfileId === id ? { ...c, voiceProfileId: null } : c)));
      if (activeProfileId === id) { setActiveProfileId(null); setPhase('troupe'); }
    } catch (err) {
      alert(`声紋の削除に失敗しました: ${err.message}`);
    }
  };

  const addChapter = async () => {
    try {
      const created = await apiFetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', body: '' }),
      });
      setChapters((prev) => [...prev, mapChapter(created)]);
    } catch (err) {
      alert(`章の作成に失敗しました: ${err.message}`);
    }
  };

  const updateChapter = (id, patch) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const persistChapterUpdate = async (id, patch) => {
    updateChapter(id, patch);
    const serverPatch = {};
    if (patch.title !== undefined) serverPatch.title = patch.title;
    if (patch.body !== undefined) serverPatch.body = patch.body;
    if (patch.voiceProfileId !== undefined) serverPatch.voice_profile_id = patch.voiceProfileId;
    if (Object.keys(serverPatch).length === 0) return;
    try {
      await apiFetch(`/api/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPatch),
      });
    } catch (err) {
      console.error('章の更新に失敗しました', err);
    }
  };

  const deleteChapter = async (id) => {
    try {
      await apiFetch(`/api/chapters/${id}`, { method: 'DELETE' });
      setChapters((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(`章の削除に失敗しました: ${err.message}`);
    }
  };

  const generateDraft = async (id) => {
    updateChapter(id, { draftStatus: 'generating' });
    try {
      await apiFetch(`/api/chapters/${id}/generate-draft`, { method: 'POST' });
    } catch (err) {
      updateChapter(id, { draftStatus: 'failed', error: err.message });
    }
  };

  const uploadChapterDraft = async ({ audioBlobOrFile, fileName }) => {
    const chapterId = draftModalChapterId;
    if (!chapterId) return;
    const formData = new FormData();
    formData.append('audio', audioBlobOrFile, fileName);
    const updated = await apiFetch(`/api/chapters/${chapterId}/upload-draft`, { method: 'POST', body: formData });
    updateChapter(chapterId, mapChapter(updated));
    setDraftModalChapterId(null);
  };

  const applyVoice = async (id) => {
    const chapter = chapters.find((c) => c.id === id);
    if (!chapter || !chapter.voiceProfileId) return;
    updateChapter(id, { finalStatus: 'generating' });
    try {
      await apiFetch(`/api/chapters/${id}/apply-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_profile_id: chapter.voiceProfileId }),
      });
    } catch (err) {
      updateChapter(id, { finalStatus: 'failed', error: err.message });
    }
  };

  const togglePlayChapter = useCallback((key) => {
    if (playingChapterId && playingChapterId !== key) {
      document.getElementById(`audio-${playingChapterId}`)?.pause();
    }
    if (key === null) { setPlayingChapterId(null); return; }
    const el = document.getElementById(`audio-${key}`);
    if (!el) return;
    if (playingChapterId === key) {
      el.pause();
      setPlayingChapterId(null);
    } else {
      el.currentTime = 0;
      el.play();
      setPlayingChapterId(key);
    }
  }, [playingChapterId]);

  const togglePlayProfile = useCallback((id) => {
    if (playingProfileId && playingProfileId !== id) {
      document.getElementById(`audio-${playingProfileId}`)?.pause();
    }
    if (id === null) { setPlayingProfileId(null); return; }
    const el = document.getElementById(`audio-${id}`);
    if (!el) return;
    if (playingProfileId === id) {
      el.pause();
      setPlayingProfileId(null);
    } else {
      el.currentTime = 0;
      el.play();
      setPlayingProfileId(id);
    }
  }, [playingProfileId]);

  const enterStage = (profileId) => {
    setActiveProfileId(profileId);
    setActIndex(0);
    setPhase('stage');
  };

  const backToTroupe = () => {
    if (playingChapterId) togglePlayChapter(null);
    setPhase('troupe');
  };

  const activeProfile = voiceProfiles.find((p) => p.id === activeProfileId) || null;
  const activeColorKey = ERA_PALETTE[Math.max(0, voiceProfiles.findIndex((p) => p.id === activeProfileId)) % ERA_PALETTE.length];
  const acts = activeProfile ? chapters.filter((c) => c.voiceProfileId === activeProfile.id && c.finalStatus === 'done') : [];
  const currentAct = acts[actIndex] || null;

  // 幕(章)送り: ← → キーで舞台上の章を送れるようにする
  useEffect(() => {
    if (phase !== 'stage' || backstageOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setActIndex((i) => Math.min(i + 1, Math.max(acts.length - 1, 0)));
      if (e.key === 'ArrowLeft') setActIndex((i) => Math.max(i - 1, 0));
      if (e.key === 'Escape') backToTroupe();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, backstageOpen, acts.length]);

  return (
    <div style={styles.stageRoot}>
      <style>{`
        .vx-spot { transition: transform 0.22s ease, box-shadow 0.22s ease; }
        .vx-spot:hover { transform: translateY(-4px); }
        .vx-ctrl { transition: transform 0.15s ease, opacity 0.15s ease, filter 0.15s ease; }
        .vx-ctrl:hover { transform: translateY(-1px); filter: brightness(1.15); }
        .vx-ctrl:active { transform: translateY(0); }
      `}</style>

      <VersionBadge onOpenBackstage={() => setBackstageOpen(true)} />

      {loading && (
        <div style={styles.centerNote}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          <span>幕を上げています…</span>
        </div>
      )}

      {!loading && loadError && (
        <div style={styles.centerNote}>
          <p style={styles.errorText}>バックエンドに接続できませんでした({loadError})</p>
          <p style={styles.errorHint}>APIサーバー(backend/main.py)を起動してから再読み込みしてください。</p>
        </div>
      )}

      {!loading && !loadError && backstageOpen && (
        <Backstage
          voiceProfiles={voiceProfiles}
          chapters={chapters}
          onClose={() => setBackstageOpen(false)}
          onDeleteProfile={deleteVoiceProfile}
          onOpenRecord={() => setShowRecordModal(true)}
          onOpenUpload={() => setShowUploadModal(true)}
          onAddChapter={addChapter}
          onUpdateChapter={persistChapterUpdate}
          onDeleteChapter={deleteChapter}
          onGenerateDraft={generateDraft}
          onOpenDraftUpload={setDraftModalChapterId}
          onApplyVoice={applyVoice}
          playingChapterId={playingChapterId}
          onTogglePlayChapter={togglePlayChapter}
          playingProfileId={playingProfileId}
          onTogglePlayProfile={togglePlayProfile}
        />
      )}

      {!loading && !loadError && !backstageOpen && phase === 'troupe' && (
        <Troupe
          voiceProfiles={voiceProfiles}
          onEnter={enterStage}
          onOpenRecord={() => setShowRecordModal(true)}
          onOpenUpload={() => setShowUploadModal(true)}
        />
      )}

      {!loading && !loadError && !backstageOpen && phase === 'stage' && activeProfile && (
        <StagePerformance
          profile={activeProfile}
          colorKey={activeColorKey}
          acts={acts}
          actIndex={actIndex}
          act={currentAct}
          onBack={backToTroupe}
          onPrev={() => setActIndex((i) => Math.max(i - 1, 0))}
          onNext={() => setActIndex((i) => Math.min(i + 1, acts.length - 1))}
          isPlaying={currentAct ? playingChapterId === `final-${currentAct.id}` : false}
          onTogglePlay={() => currentAct && togglePlayChapter(`final-${currentAct.id}`)}
          onOpenBackstage={() => setBackstageOpen(true)}
        />
      )}

      {showRecordModal && <RecordModal onClose={() => setShowRecordModal(false)} onSave={addVoiceProfile} />}
      {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} onSave={addVoiceProfile} />}
      {draftModalChapterId && (
        <ChapterDraftModal onClose={() => setDraftModalChapterId(null)} onSave={uploadChapterDraft} />
      )}
    </div>
  );
}

// ----- 右上の小さなバッジ: 現在バージョンXであることと、楽屋への入口 -----
function VersionBadge({ onOpenBackstage }) {
  return (
    <button onClick={onOpenBackstage} style={styles.backstageFab} title="楽屋(声・章の編集)">
      <Settings2 size={14} />
      <span>楽屋</span>
    </button>
  );
}

// ----- フェーズ1: 一座(声を選ぶ舞台) -----
function Troupe({ voiceProfiles, onEnter, onOpenRecord, onOpenUpload }) {
  return (
    <div style={styles.troupeWrap}>
      <div style={styles.troupeHaze} />
      <div style={styles.troupeInner}>
        <div style={styles.eyebrow}>声の劇場 — VOICE THEATER</div>
        <h1 style={styles.title}>声の記憶帳</h1>
        <p style={styles.lead}>暗闇の中、ひとつずつ照明を灯して声を迎える。触れた声だけが、舞台に立つ。</p>

        {voiceProfiles.length === 0 ? (
          <div style={styles.emptyStage}>
            <div style={styles.emptySpot} />
            <p style={styles.emptyText}>まだ誰も舞台に招かれていません。</p>
            <div style={styles.emptyActions}>
              <button className="vx-ctrl" onClick={onOpenRecord} style={styles.primaryBtn}>
                <Mic size={14} /> 新規録音
              </button>
              <button className="vx-ctrl" onClick={onOpenUpload} style={styles.secondaryBtn}>
                <Upload size={14} /> 過去の音声を追加
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.spotRow}>
              {voiceProfiles.map((p, i) => {
                const colorKey = ERA_PALETTE[i % ERA_PALETTE.length];
                const gel = ERA_COLORS[colorKey].bg;
                return (
                  <button key={p.id} className="vx-spot" onClick={() => onEnter(p.id)} style={styles.spotBtn}>
                    <span style={{ ...styles.spotGlow, background: `radial-gradient(circle, ${gel}55 0%, ${gel}18 45%, transparent 72%)` }} />
                    <span style={{ ...styles.spotRing, borderColor: gel }} />
                    <span style={styles.spotLabel}>{p.label}</span>
                    <span style={styles.spotEra}>{p.eraTag || '年代未設定'}</span>
                  </button>
                );
              })}
              <button className="vx-spot" onClick={onOpenRecord} style={{ ...styles.spotBtn, ...styles.spotBtnAdd }}>
                <Plus size={20} style={{ opacity: 0.6 }} />
                <span style={styles.spotAddLabel}>声を招く</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ----- フェーズ2: 舞台上(章=幕をひとつずつ演じる) -----
function StagePerformance({ profile, colorKey, acts, actIndex, act, onBack, onPrev, onNext, isPlaying, onTogglePlay, onOpenBackstage }) {
  const gel = ERA_COLORS[colorKey].bg;
  return (
    <div style={styles.perfWrap}>
      <div style={styles.perfTopBar}>
        <button className="vx-ctrl" onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={14} /> 一座へ戻る
        </button>
        <div style={styles.perfTitleRow}>
          <span style={{ ...styles.perfDot, background: gel }} />
          <span style={styles.perfName}>{profile.label}</span>
        </div>
        {acts.length > 0 ? (
          <span style={styles.actCounter}>ACT {String(actIndex + 1).padStart(2, '0')} / {String(acts.length).padStart(2, '0')}</span>
        ) : <span style={styles.actCounter} />}
      </div>

      {acts.length === 0 && (
        <div style={styles.perfEmpty}>
          <p style={styles.emptyText}>{profile.label}の声で仕上がった章はまだありません。</p>
          <button className="vx-ctrl" onClick={onOpenBackstage} style={styles.secondaryBtn}>
            <Settings2 size={14} /> 楽屋で章を仕上げる
          </button>
        </div>
      )}

      {act && (
        <div key={act.id} style={styles.perfStage}>
          <div style={{ ...styles.beam, background: `linear-gradient(180deg, ${gel}00 0%, ${gel}2E 55%, ${gel}00 100%)` }} />
          <div style={styles.actKicker}>第{String(actIndex + 1)}幕</div>
          <h2 style={styles.actTitle}>{act.title || '無題の章'}</h2>

          <div style={styles.spotZone}>
            <span
              style={{
                ...styles.perfGlow,
                background: `radial-gradient(circle, ${gel}4A 0%, ${gel}16 45%, transparent 72%)`,
                animation: isPlaying ? 'spotBreathe 3.2s ease-in-out infinite' : 'none',
              }}
            />
            <button className="vx-ctrl" onClick={onTogglePlay} style={{ ...styles.playBtn, borderColor: gel, color: gel }}>
              {isPlaying ? <Pause size={26} /> : <Play size={26} style={{ marginLeft: 3 }} />}
            </button>
          </div>

          <div style={styles.footlights}>
            <Waveform active={isPlaying} bars={26} size="lg" color={isPlaying ? gel : COLORS.ivoryFaint} />
          </div>

          <audio
            id={`audio-final-${act.id}`}
            src={act.finalAudioUrl}
            onEnded={onTogglePlay}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {acts.length > 1 && (
        <div style={styles.perfNav}>
          <button className="vx-ctrl" onClick={onPrev} disabled={actIndex === 0} style={{ ...styles.navBtn, opacity: actIndex === 0 ? 0.3 : 1 }}>
            <ChevronLeft size={20} />
          </button>
          <button className="vx-ctrl" onClick={onNext} disabled={actIndex === acts.length - 1} style={{ ...styles.navBtn, opacity: actIndex === acts.length - 1 ? 0.3 : 1 }}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ----- 楽屋: 声紋・章の管理(V2の技術コンソールを流用) -----
function Backstage(props) {
  const {
    voiceProfiles, chapters, onClose, onDeleteProfile, onOpenRecord, onOpenUpload,
    onAddChapter, onUpdateChapter, onDeleteChapter, onGenerateDraft, onOpenDraftUpload,
    onApplyVoice, playingChapterId, onTogglePlayChapter, playingProfileId, onTogglePlayProfile,
  } = props;
  return (
    <div style={styles.backstageWrap}>
      <div style={styles.backstageHeader}>
        <div>
          <div style={styles.eyebrowSmall}>BACKSTAGE — 技術コンソール</div>
          <h2 style={styles.backstageTitle}>楽屋</h2>
        </div>
        <button className="vx-ctrl" onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
      </div>

      <div style={styles.backstageBody}>
        <section style={{ marginBottom: 32 }}>
          <div style={styles.backstageSectionRow}>
            <h3 style={styles.backstageSectionTitle}>声紋</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="vx-ctrl" onClick={onOpenRecord} style={styles.secondaryBtnSm}><Mic size={13} /> 新規録音</button>
              <button className="vx-ctrl" onClick={onOpenUpload} style={styles.secondaryBtnSm}><Upload size={13} /> 音声を追加</button>
            </div>
          </div>
          {voiceProfiles.length === 0 && <p style={styles.emptyText}>まだ声紋がありません。</p>}
          {voiceProfiles.map((p, i) => (
            <SignalReader
              key={p.id}
              profile={p}
              colorKey={V2_ERA_PALETTE[i % V2_ERA_PALETTE.length]}
              isPlaying={playingProfileId === p.id}
              onTogglePlay={onTogglePlayProfile}
              onDelete={onDeleteProfile}
            />
          ))}
        </section>

        <section>
          <div style={styles.backstageSectionRow}>
            <h3 style={styles.backstageSectionTitle}>章立て</h3>
            <span style={styles.progressNote}>{chapters.filter((c) => c.finalStatus === 'done').length} / {chapters.length} 章が完成</span>
          </div>
          {chapters.length === 0 && (
            <p style={styles.emptyText}>
              まだ章がありません。下の「章を追加」で章を作り、タイトルとナレーション本文を入力してください。
              声紋を選んで「この声で仕上げる」と、その声の幕として舞台に上がります。
            </p>
          )}
          {chapters.map((c) => (
            <div key={c.id} style={{ marginBottom: 14 }}>
              <ChapterCard
                chapter={c}
                voiceProfiles={voiceProfiles}
                finalEngine={null}
                onUpdate={onUpdateChapter}
                onDelete={onDeleteChapter}
                onGenerateDraft={onGenerateDraft}
                onOpenDraftUpload={onOpenDraftUpload}
                onApplyVoice={onApplyVoice}
                playingChapterId={playingChapterId}
                onTogglePlay={onTogglePlayChapter}
              />
            </div>
          ))}
          <button className="vx-ctrl" onClick={onAddChapter} style={styles.primaryBtnSm}>
            <Plus size={15} /> 章を追加
          </button>
        </section>
      </div>
    </div>
  );
}

const styles = {
  stageRoot: {
    minHeight: '100vh',
    background: `radial-gradient(120% 90% at 50% -10%, ${COLORS.stageRaised} 0%, ${COLORS.stage} 45%, ${COLORS.stageDeep} 100%)`,
    color: COLORS.ivory,
    fontFamily: FONT_BODY,
    position: 'relative',
  },
  backstageFab: {
    position: 'fixed', top: 14, right: 66, zIndex: 45,
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(244,237,224,0.06)', border: `1px solid ${COLORS.line}`,
    color: COLORS.ivorySoft, borderRadius: 999, padding: '7px 13px',
    fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer',
  },
  centerNote: {
    minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 10, fontFamily: FONT_MONO, fontSize: 12.5, color: COLORS.ivorySoft,
    textAlign: 'center', padding: '0 24px',
  },
  errorText: { color: '#F0A9A9', margin: 0, fontFamily: FONT_BODY, fontSize: 13.5 },
  errorHint: { color: COLORS.ivoryFaint, margin: 0, fontSize: 12 },

  troupeWrap: { position: 'relative', minHeight: '100vh', overflow: 'hidden' },
  troupeHaze: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: `radial-gradient(60% 40% at 50% 30%, rgba(232,199,126,0.07) 0%, transparent 70%)`,
  },
  troupeInner: {
    position: 'relative', maxWidth: 860, margin: '0 auto', padding: '96px 24px 80px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  eyebrow: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.28em', color: COLORS.gelGold, marginBottom: 18 },
  title: { fontFamily: FONT_STAGE, fontSize: 'clamp(40px, 8vw, 68px)', fontWeight: 600, margin: '0 0 16px', letterSpacing: '0.03em' },
  lead: { fontSize: 14, color: COLORS.ivorySoft, lineHeight: 1.9, maxWidth: 440, margin: '0 0 56px' },

  spotRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 28 },
  spotBtn: {
    position: 'relative', width: 148, height: 168, border: 'none', background: 'none', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '0 0 8px',
  },
  spotGlow: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 148, height: 148, borderRadius: '50%' },
  spotRing: {
    position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
    width: 88, height: 88, borderRadius: '50%', border: '1.5px solid', opacity: 0.75,
  },
  spotLabel: { position: 'relative', fontFamily: FONT_STAGE, fontSize: 17, fontWeight: 600, color: COLORS.ivory },
  spotEra: { position: 'relative', fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.1em', color: COLORS.ivoryFaint },
  spotBtnAdd: { justifyContent: 'center', border: `1px dashed ${COLORS.lineBright}`, borderRadius: 12, gap: 8 },
  spotAddLabel: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.08em', color: COLORS.ivoryFaint },

  emptyStage: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 },
  emptySpot: {
    width: 120, height: 120, borderRadius: '50%',
    background: `radial-gradient(circle, ${COLORS.gelGold}22 0%, transparent 72%)`,
    animation: 'emberPulse 2.4s ease-in-out infinite',
  },
  emptyText: { fontSize: 13, color: COLORS.ivoryFaint, margin: 0 },
  emptyActions: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },

  primaryBtn: {
    display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 999,
    background: COLORS.gelGold, color: COLORS.stageDeep, fontFamily: FONT_MONO, fontWeight: 700,
    fontSize: 12, letterSpacing: '0.04em', padding: '10px 18px', cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999,
    background: 'rgba(244,237,224,0.05)', border: `1px solid ${COLORS.lineBright}`, color: COLORS.ivorySoft,
    fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '0.04em', padding: '10px 18px', cursor: 'pointer',
  },

  perfWrap: { position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  perfTopBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '18px 20px', borderBottom: `1px solid ${COLORS.line}`, flexWrap: 'wrap',
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none',
    color: COLORS.ivorySoft, fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: '0.04em', cursor: 'pointer',
  },
  perfTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  perfDot: { width: 7, height: 7, borderRadius: '50%' },
  perfName: { fontFamily: FONT_STAGE, fontSize: 15, fontWeight: 600 },
  actCounter: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.1em', color: COLORS.ivoryFaint },

  perfEmpty: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 16, padding: '40px 24px', textAlign: 'center',
  },

  perfStage: {
    flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '40px 24px 56px', animation: 'curtainReveal 0.5s ease both',
  },
  beam: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 220, height: '55%', clipPath: 'polygon(46% 0%, 54% 0%, 100% 100%, 0% 100%)', pointerEvents: 'none' },
  actKicker: { position: 'relative', fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.24em', color: COLORS.ivoryFaint, marginBottom: 10 },
  actTitle: { position: 'relative', fontFamily: FONT_STAGE, fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 600, margin: '0 0 40px', textAlign: 'center', maxWidth: 560 },

  spotZone: { position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  perfGlow: { position: 'absolute', inset: 0, borderRadius: '50%' },
  playBtn: {
    position: 'relative', width: 78, height: 78, borderRadius: '50%', background: 'rgba(8,7,10,0.55)',
    border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  footlights: { position: 'relative' },

  perfNav: { display: 'flex', justifyContent: 'space-between', padding: '0 24px 28px', maxWidth: 420, margin: '0 auto', width: '100%' },
  navBtn: {
    width: 40, height: 40, borderRadius: '50%', border: `1px solid ${COLORS.lineBright}`,
    background: 'rgba(244,237,224,0.04)', color: COLORS.ivory,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },

  backstageWrap: { position: 'relative', minHeight: '100vh', maxWidth: 760, margin: '0 auto', padding: '20px 20px 80px' },
  backstageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingTop: 8 },
  eyebrowSmall: { fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.18em', color: COLORS.gelGold, marginBottom: 6 },
  backstageTitle: { fontFamily: FONT_STAGE, fontSize: 26, fontWeight: 600, margin: 0 },
  closeBtn: {
    width: 34, height: 34, borderRadius: '50%', border: `1px solid ${COLORS.lineBright}`,
    background: 'rgba(244,237,224,0.04)', color: COLORS.ivory,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  backstageBody: {},
  backstageSectionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 },
  backstageSectionTitle: { fontFamily: FONT_STAGE, fontSize: 18, fontWeight: 600, margin: 0 },
  progressNote: { fontFamily: FONT_MONO, fontSize: 11, color: COLORS.ivoryFaint },
  secondaryBtnSm: {
    display: 'flex', alignItems: 'center', gap: 5, borderRadius: 999,
    background: 'rgba(244,237,224,0.05)', border: `1px solid ${COLORS.lineBright}`, color: COLORS.ivorySoft,
    fontFamily: FONT_MONO, fontSize: 10.5, padding: '6px 12px', cursor: 'pointer',
  },
  primaryBtnSm: {
    display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 999,
    background: COLORS.gelGold, color: COLORS.stageDeep, fontFamily: FONT_MONO, fontWeight: 700,
    fontSize: 11.5, padding: '9px 16px', cursor: 'pointer', marginTop: 6,
  },
};
