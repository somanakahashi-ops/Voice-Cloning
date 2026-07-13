import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Upload, Play, Pause, Plus, X, Check, Loader2, FileAudio, Clock, BookOpen, Trash2 } from 'lucide-react';

// ============================================================
// データモデル(設計通りの構造をフロントの状態として再現)
// VoiceProfile { id, label, eraTag, sourceType, audioUrl, durationSec, qualityNote, createdAt }
// Chapter { id, title, body, voiceProfileId, status, generatedAudioUrl }
// ============================================================

const ERA_COLORS = {
  amber: { bg: '#B8773D', bgSoft: '#E8D4BC', text: '#5A3A1A' },
  pine: { bg: '#4A5C4A', bgSoft: '#D3DBD0', text: '#26301F' },
  ink: { bg: '#3D4A5C', bgSoft: '#CFD7E0', text: '#1E2733' },
};
const ERA_PALETTE = ['amber', 'pine', 'ink'];

// バックエンドAPIのベースURL。環境変数等で差し替え可能にしておく。
// 接続先が起動していない場合、各API呼び出しはエラーをスローし、
// 呼び出し元でユーザーに分かる形のエラーメッセージとして表示する。
export const API_BASE = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE)
  || 'http://localhost:8000';

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    throw new Error('バックエンドに接続できません。サーバーが起動しているか確認してください。');
  }
  if (!res.ok) {
    let detail = `リクエストに失敗しました(${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // JSONでなければそのまま
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function toAbsoluteUrl(path) {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

// サーバー側のスネークケースをフロントのキャメルケース構造にマッピング
function mapVoiceProfile(p) {
  return {
    id: p.id,
    label: p.label,
    eraTag: p.era_tag,
    sourceType: p.source_type,
    audioUrl: toAbsoluteUrl(p.audio_url),
    durationSec: p.duration_sec,
    qualityNote: p.quality_note,
  };
}

function mapChapter(c) {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    voiceProfileId: c.voice_profile_id,
    draftStatus: c.draft_status,
    draftAudioUrl: toAbsoluteUrl(c.draft_audio_url),
    draftSourceBody: c.draft_source_body,
    draftSource: c.draft_source, // "tts" | "recording" | null
    finalStatus: c.final_status,
    finalAudioUrl: toAbsoluteUrl(c.final_audio_url),
    error: c.error,
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(sec) {
  if (!sec && sec !== 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ----- 録音モーダル -----
function RecordModal({ onClose, onSave }) {
  const [label, setLabel] = useState('');
  const [eraTag, setEraTag] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      setError('マイクにアクセスできませんでした。ブラウザの権限設定を確認してください。');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const canSave = label.trim() && audioUrl && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ label, eraTag, audioBlob, fileName: 'recording.webm', sourceType: '新規録音' });
    } catch (err) {
      setError(err.message || '保存に失敗しました');
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>声紋を録音する</h3>
          <button onClick={onClose} style={styles.iconBtn}><X size={18} /></button>
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>ラベル(例: 20代、結婚式当日)</label>
          <input
            style={styles.input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="この声紋の名前"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>年代タグ(任意)</label>
          <input
            style={styles.input}
            value={eraTag}
            onChange={(e) => setEraTag(e.target.value)}
            placeholder="例: 1985年頃"
          />
        </div>

        <div style={styles.recordArea}>
          {!audioUrl ? (
            <>
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{
                  ...styles.recordBtn,
                  background: recording ? '#8C3B2E' : '#2B2724',
                }}
              >
                {recording ? <Square size={22} fill="white" /> : <Mic size={22} />}
              </button>
              <div style={styles.recordStatus}>
                {recording ? `録音中... ${formatTime(duration)}` : '録音を開始するにはタップ'}
              </div>
            </>
          ) : (
            <div style={styles.recordedPreview}>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
              <button
                onClick={() => { setAudioUrl(null); setDuration(0); }}
                style={styles.linkBtn}
              >
                録り直す
              </button>
            </div>
          )}
          {error && <div style={styles.errorText}>{error}</div>}
        </div>

        <button
          disabled={!canSave}
          onClick={handleSave}
          style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
        >
          {saving ? '保存中...' : '声紋として保存'}
        </button>
      </div>
    </div>
  );
}

// ----- アップロードモーダル(過去の音声素材用) -----
function UploadModal({ onClose, onSave }) {
  const [label, setLabel] = useState('');
  const [eraTag, setEraTag] = useState('');
  const [fileName, setFileName] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setFileName(file.name);
    setAudioUrl(URL.createObjectURL(file));
    setError(null);
  };

  const canSave = label.trim() && audioFile && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // quality_note はサーバー側の前処理結果として返ってくる想定
      await onSave({ label, eraTag, audioFile, sourceType: 'アップロード素材' });
    } catch (err) {
      setError(err.message || '保存に失敗しました');
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>過去の音声素材をアップロード</h3>
          <button onClick={onClose} style={styles.iconBtn}><X size={18} /></button>
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>ラベル(例: 40代、社内講演の録音)</label>
          <input style={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="この声紋の名前" />
        </div>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>年代タグ(任意)</label>
          <input style={styles.input} value={eraTag} onChange={(e) => setEraTag(e.target.value)} placeholder="例: 2003年頃" />
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>音声ファイル</label>
          <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={styles.uploadBtn}>
            <Upload size={16} />
            {fileName || 'ファイルを選択'}
          </button>
        </div>

        {audioUrl && (
          <div style={{ marginTop: 12 }}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
          </div>
        )}

        {error && <div style={styles.errorText}>{error}</div>}


        <button
          disabled={!canSave}
          onClick={handleSave}
          style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
        >
          {saving ? '保存中...' : '声紋として保存'}
        </button>
      </div>
    </div>
  );
}

// ----- 章の下書き音声モーダル(本人による実録音 or 音声ファイルのアップロード) -----
// Step1をTTS合成に頼らず、本人が現在の声で読み上げた録音をそのまま下書きにできる。
// 声質変換(Step2)はどちらの下書きに対しても同じように使える。
function ChapterDraftModal({ onClose, onSave }) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlobOrFile, setAudioBlobOrFile] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileRef = useRef(null);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlobOrFile(blob);
        setFileName('recording.webm');
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      setError('マイクにアクセスできませんでした。ブラウザの権限設定を確認してください。');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlobOrFile(file);
    setFileName(file.name);
    setAudioUrl(URL.createObjectURL(file));
    setError(null);
  };

  const reset = () => { setAudioUrl(null); setAudioBlobOrFile(null); setFileName(null); setDuration(0); };

  const canSave = audioBlobOrFile && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ audioBlobOrFile, fileName: fileName || 'recording.webm' });
    } catch (err) {
      setError(err.message || '保存に失敗しました');
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>本人の声で読み上げた録音を使う</h3>
          <button onClick={onClose} style={styles.iconBtn}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B6356', margin: '0 0 14px', lineHeight: 1.6 }}>
          この章の本文を、本人が現在の声で読み上げてください。TTS合成を使わないため、
          読み上げの自然さがそのまま活きます。声質変換(Step2)で年代の声に仕上げられます。
        </p>

        {!audioUrl ? (
          <>
            <div style={styles.recordArea}>
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{ ...styles.recordBtn, background: recording ? '#8C3B2E' : '#2B2724' }}
              >
                {recording ? <Square size={22} fill="white" /> : <Mic size={22} />}
              </button>
              <div style={styles.recordStatus}>
                {recording ? `録音中... ${formatTime(duration)}` : '録音を開始するにはタップ'}
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: 11.5, color: '#8A8273', margin: '10px 0' }}>または</div>

            <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={styles.uploadBtn}>
              <Upload size={16} />
              録音済みファイルをアップロード
            </button>
          </>
        ) : (
          <div style={styles.recordedPreview}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
            <button onClick={reset} style={styles.linkBtn}>録り直す・選び直す</button>
          </div>
        )}

        {error && <div style={styles.errorText}>{error}</div>}

        <button
          disabled={!canSave}
          onClick={handleSave}
          style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
        >
          {saving ? 'アップロード中...' : 'この録音を下書きにする'}
        </button>
      </div>
    </div>
  );
}

// ----- 声紋カード(カセットテープ風) -----
function VoiceProfileCard({ profile, colorKey, onDelete, playingId, onTogglePlay }) {
  const c = ERA_COLORS[colorKey];
  const isPlaying = playingId === profile.id;
  return (
    <div style={{ ...styles.cassette, background: c.bgSoft, borderColor: c.bg }}>
      <div style={{ ...styles.cassetteLabel, background: c.bg }}>
        <span style={styles.cassetteEra}>{profile.eraTag || '年代未設定'}</span>
      </div>
      <div style={styles.cassetteBody}>
        <div style={styles.cassetteReels}>
          <div style={{ ...styles.reel, borderColor: c.bg }} />
          <div style={{ ...styles.reel, borderColor: c.bg }} />
        </div>
        <div style={styles.cassetteTitle}>{profile.label}</div>
        <div style={styles.cassetteMeta}>
          <FileAudio size={12} /> {profile.sourceType}
          {profile.durationSec != null && <> · <Clock size={12} style={{ marginLeft: 4 }} /> {formatTime(profile.durationSec)}</>}
        </div>
        <div style={styles.cassetteActions}>
          <button onClick={() => onTogglePlay(profile.id)} style={{ ...styles.smallIconBtn, color: c.text }}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => onDelete(profile.id)} style={{ ...styles.smallIconBtn, color: '#8C3B2E' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <audio
        id={`audio-${profile.id}`}
        src={profile.audioUrl}
        onEnded={() => onTogglePlay(null)}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ----- 章カード(2段階: 読み上げ生成 → 声で仕上げる) -----
function ChapterCard({ chapter, voiceProfiles, onUpdate, onDelete, onGenerateDraft, onOpenDraftUpload, onApplyVoice, playingChapterId, onTogglePlay }) {
  const profile = voiceProfiles.find((p) => p.id === chapter.voiceProfileId);
  const isPlayingDraft = playingChapterId === `draft-${chapter.id}`;
  const isPlayingFinal = playingChapterId === `final-${chapter.id}`;
  const hasDraft = chapter.draftStatus === 'done';
  const bodyChangedSinceDraft = hasDraft && chapter.draftSourceBody !== chapter.body;
  const isRecordingDraft = chapter.draftSource === 'recording';

  return (
    <div style={styles.chapterCard}>
      <div style={styles.chapterHeaderRow}>
        <input
          style={styles.chapterTitleInput}
          value={chapter.title}
          onChange={(e) => onUpdate(chapter.id, { title: e.target.value })}
          placeholder="章のタイトル(例: 幼少期)"
        />
        <button onClick={() => onDelete(chapter.id)} style={styles.smallIconBtn}>
          <X size={16} />
        </button>
      </div>

      <textarea
        style={styles.chapterTextarea}
        value={chapter.body}
        onChange={(e) => onUpdate(chapter.id, { body: e.target.value })}
        placeholder="この章のナレーション原稿を入力..."
        rows={4}
      />

      {/* Step 1: 下書き音声を用意する(声紋非依存) */}
      <div style={styles.stepBlock}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNumber}>1</span>
          <span style={styles.stepLabel}>下書き音声を用意する</span>
          <span style={styles.stepHint}>本人の実録音、またはTTS合成(声質はまだ年代の声ではありません)</span>
        </div>

        {chapter.draftStatus === 'idle' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => onOpenDraftUpload(chapter.id)} style={styles.stepBtn}>
              本人の声で録音/アップロード
            </button>
            <button
              disabled={!chapter.body.trim()}
              onClick={() => onGenerateDraft(chapter.id)}
              style={{ ...styles.stepBtnOutline, opacity: !chapter.body.trim() ? 0.4 : 1, cursor: !chapter.body.trim() ? 'not-allowed' : 'pointer' }}
            >
              TTSで読み上げを生成
            </button>
          </div>
        )}
        {chapter.draftStatus === 'generating' && (
          <div style={styles.generatingChip}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            読み上げ生成中...
          </div>
        )}
        {hasDraft && (
          <div style={styles.donePlayer}>
            {chapter.draftAudioUrl && (
              <button onClick={() => onTogglePlay(`draft-${chapter.id}`)} style={{ ...styles.playDoneBtn, background: '#8A8273' }}>
                {isPlayingDraft ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )}
            <span style={styles.doneLabelMuted}>
              <Check size={12} /> {isRecordingDraft ? '本人録音あり(非公開)' : 'TTS下書きあり'}
            </span>
            {bodyChangedSinceDraft && (
              <button
                onClick={() => (isRecordingDraft ? onOpenDraftUpload(chapter.id) : onGenerateDraft(chapter.id))}
                style={styles.regenLink}
              >
                本文が変更されました・{isRecordingDraft ? '録音をやり直す' : '再生成'}
              </button>
            )}
            <audio
              id={`audio-draft-${chapter.id}`}
              src={chapter.draftAudioUrl}
              onEnded={() => onTogglePlay(null)}
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Step 2: 声紋で肉付け(声質変換) */}
      <div style={{ ...styles.stepBlock, opacity: hasDraft ? 1 : 0.45 }}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNumber}>2</span>
          <span style={styles.stepLabel}>この声で仕上げる</span>
          <span style={styles.stepHint}>声紋ベクトルを下書きに反映し、本人の声質に変換</span>
        </div>

        <div style={styles.chapterFooter}>
          <select
            disabled={!hasDraft}
            style={styles.voiceSelect}
            value={chapter.voiceProfileId || ''}
            onChange={(e) => onUpdate(chapter.id, { voiceProfileId: e.target.value || null })}
          >
            <option value="">声紋を選択...</option>
            {voiceProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.label}{p.eraTag ? `(${p.eraTag})` : ''}</option>
            ))}
          </select>

          {chapter.finalStatus !== 'generating' && (
            <button
              disabled={!hasDraft || !chapter.voiceProfileId}
              onClick={() => onApplyVoice(chapter.id)}
              style={{
                ...styles.generateBtn,
                opacity: (!hasDraft || !chapter.voiceProfileId) ? 0.4 : 1,
                cursor: (!hasDraft || !chapter.voiceProfileId) ? 'not-allowed' : 'pointer',
              }}
            >
              この声で仕上げる
            </button>
          )}
          {chapter.finalStatus === 'generating' && (
            <div style={styles.generatingChip}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              声質変換中...
            </div>
          )}
        </div>

        {chapter.finalStatus === 'done' && (
          <div style={styles.donePlayer}>
            <button onClick={() => onTogglePlay(`final-${chapter.id}`)} style={styles.playDoneBtn}>
              {isPlayingFinal ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <span style={styles.doneLabel}><Check size={12} /> 完成({profile?.label})</span>
            <audio
              id={`audio-final-${chapter.id}`}
              src={chapter.finalAudioUrl}
              onEnded={() => onTogglePlay(null)}
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ----- メインアプリ -----
export default function VoiceNarrationApp() {
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  // 章はサーバーからのロードで埋まる(初期値は空。接続前のチラつきを避けるため仮データは置かない)
  const [chapters, setChapters] = useState([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [draftModalChapterId, setDraftModalChapterId] = useState(null);
  const [playingProfileId, setPlayingProfileId] = useState(null);
  const [playingChapterId, setPlayingChapterId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初期ロード: サーバーから声紋・章の一覧を取得
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

  // 生成中(generating)の章があれば、完了するまで定期的にステータスを取得する
  useEffect(() => {
    const pendingIds = chapters
      .filter((c) => c.draftStatus === 'generating' || c.finalStatus === 'generating')
      .map((c) => c.id);
    if (pendingIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of pendingIds) {
        try {
          const data = await apiFetch(`/api/chapters/${id}/status`);
          updateChapter(id, mapChapter(data));
        } catch (err) {
          // ポーリング中の一時的な失敗は無視して次回再試行
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
    // 録音(Blob)とアップロード(File)の両方に対応
    const filePart = data.audioBlob || data.audioFile;
    const fileName = data.fileName || data.audioFile?.name || 'audio.wav';
    formData.append('audio', filePart, fileName);

    const created = await apiFetch('/api/voice-profiles', {
      method: 'POST',
      body: formData,
    });
    setVoiceProfiles((prev) => [...prev, mapVoiceProfile(created)]);
    setShowRecordModal(false);
    setShowUploadModal(false);
  };

  const deleteVoiceProfile = async (id) => {
    try {
      await apiFetch(`/api/voice-profiles/${id}`, { method: 'DELETE' });
      setVoiceProfiles((prev) => prev.filter((p) => p.id !== id));
      setChapters((prev) => prev.map((c) => (c.voiceProfileId === id ? { ...c, voiceProfileId: null } : c)));
    } catch (err) {
      alert(`声紋の削除に失敗しました: ${err.message}`);
    }
  };

  const togglePlayProfile = useCallback((id) => {
    if (playingProfileId && playingProfileId !== id) {
      const prevEl = document.getElementById(`audio-${playingProfileId}`);
      prevEl?.pause();
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

  const togglePlayChapter = useCallback((key) => {
    if (playingChapterId && playingChapterId !== key) {
      const prevEl = document.getElementById(`audio-${playingChapterId}`);
      prevEl?.pause();
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

  // ローカル状態の即時更新(入力のもたつきを避ける)+ サーバーへの反映
  const updateChapter = (id, patch) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  // タイトル・本文・声紋選択の変更をサーバーに送る(デバウンスはせず素朴に都度送信)
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
      // 反映失敗時はユーザーに知らせる(本番では再試行キュー等を検討)
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

  // Step 1(TTS版): 素のTTSによる読み上げ生成をバックエンドに依頼
  const generateDraft = async (id) => {
    updateChapter(id, { draftStatus: 'generating' });
    try {
      await apiFetch(`/api/chapters/${id}/generate-draft`, { method: 'POST' });
      // 完了は useEffect のポーリングで反映される
    } catch (err) {
      updateChapter(id, { draftStatus: 'failed', error: err.message });
    }
  };

  // Step 1(本人録音版): 本人が読み上げた録音をそのまま下書きとしてアップロード
  const uploadChapterDraft = async ({ audioBlobOrFile, fileName }) => {
    const chapterId = draftModalChapterId;
    if (!chapterId) return;
    const formData = new FormData();
    formData.append('audio', audioBlobOrFile, fileName);

    const updated = await apiFetch(`/api/chapters/${chapterId}/upload-draft`, {
      method: 'POST',
      body: formData,
    });
    updateChapter(chapterId, mapChapter(updated));
    setDraftModalChapterId(null);
  };

  // Step 2: 声紋ベクトルで肉付け(KokoClone/Kanadeによる声質変換)をバックエンドに依頼
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
      // 完了は useEffect のポーリングで反映される
    } catch (err) {
      updateChapter(id, { finalStatus: 'failed', error: err.message });
    }
  };

  const doneCount = chapters.filter((c) => c.finalStatus === 'done').length;

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::placeholder { color: #A89E8F; }
      `}</style>

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerEyebrow}>VOICE ARCHIVE</div>
          <h1 style={styles.headerTitle}>声の記憶帳</h1>
          <p style={styles.headerSub}>過去の録音から声紋を集め、人生の章ごとにその声でナレーションする</p>
        </div>
      </header>

      <main style={styles.main}>
        {loadError && (
          <div style={styles.connectionError}>
            バックエンドに接続できませんでした({loadError})。
            APIサーバー(backend/main.py)を起動してから再読み込みしてください。
          </div>
        )}
        {loading && !loadError && (
          <div style={styles.loadingRow}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            読み込み中...
          </div>
        )}

        {/* 声紋ライブラリ */}
        <section style={styles.section}>
          <div style={styles.sectionHeaderRow}>
            <h2 style={styles.sectionTitle}>声紋ライブラリ</h2>
            <div style={styles.sectionActions}>
              <button onClick={() => setShowRecordModal(true)} style={styles.secondaryBtn}>
                <Mic size={14} /> 新規録音
              </button>
              <button onClick={() => setShowUploadModal(true)} style={styles.secondaryBtn}>
                <Upload size={14} /> 過去の音声を追加
              </button>
            </div>
          </div>

          {voiceProfiles.length === 0 ? (
            <div style={styles.emptyState}>
              <FileAudio size={28} style={{ opacity: 0.4 }} />
              <p style={styles.emptyText}>まだ声紋がありません。録音するか、過去の音声ファイルを追加してください。</p>
            </div>
          ) : (
            <div style={styles.cassetteRow}>
              {voiceProfiles.map((p, i) => (
                <VoiceProfileCard
                  key={p.id}
                  profile={p}
                  colorKey={ERA_PALETTE[i % ERA_PALETTE.length]}
                  onDelete={deleteVoiceProfile}
                  playingId={playingProfileId}
                  onTogglePlay={togglePlayProfile}
                />
              ))}
            </div>
          )}
        </section>

        {/* 章エディタ */}
        <section style={styles.section}>
          <div style={styles.sectionHeaderRow}>
            <h2 style={styles.sectionTitle}>
              <BookOpen size={18} style={{ marginRight: 6, verticalAlign: -3 }} />
              人生の章立て
            </h2>
            <div style={styles.progressNote}>{doneCount} / {chapters.length} 章が生成済み</div>
          </div>

          <div style={styles.timeline}>
            {chapters.map((c, i) => (
              <div key={c.id} style={styles.timelineItem}>
                <div style={styles.timelineMarker}>
                  <div style={styles.timelineDot} />
                  {i < chapters.length - 1 && <div style={styles.timelineLine} />}
                </div>
                <div style={{ flex: 1 }}>
                  <ChapterCard
                    chapter={c}
                    voiceProfiles={voiceProfiles}
                    onUpdate={persistChapterUpdate}
                    onDelete={deleteChapter}
                    onGenerateDraft={generateDraft}
                    onOpenDraftUpload={setDraftModalChapterId}
                    onApplyVoice={applyVoice}
                    playingChapterId={playingChapterId}
                    onTogglePlay={togglePlayChapter}
                  />
                </div>
              </div>
            ))}
          </div>

          <button onClick={addChapter} style={styles.addChapterBtn}>
            <Plus size={16} /> 章を追加
          </button>
        </section>
      </main>

      {showRecordModal && <RecordModal onClose={() => setShowRecordModal(false)} onSave={addVoiceProfile} />}
      {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} onSave={addVoiceProfile} />}
      {draftModalChapterId && (
        <ChapterDraftModal onClose={() => setDraftModalChapterId(null)} onSave={uploadChapterDraft} />
      )}
    </div>
  );
}

// ============================================================
// スタイル
// ============================================================
const styles = {
  app: {
    minHeight: '100vh',
    background: '#EDE8DF',
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    color: '#2B2724',
    paddingBottom: 80,
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
  loadingRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, color: '#8A8273', marginBottom: 20,
  },
  header: {
    borderBottom: '1px solid #D8D0C0',
    padding: '40px 20px 32px',
    background: 'linear-gradient(180deg, #F4F0E6 0%, #EDE8DF 100%)',
  },
  headerInner: { maxWidth: 720, margin: '0 auto' },
  headerEyebrow: {
    fontSize: 11,
    letterSpacing: '0.18em',
    color: '#B8773D',
    fontWeight: 600,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 32,
    fontWeight: 700,
    margin: '0 0 8px',
    letterSpacing: '0.02em',
  },
  headerSub: { fontSize: 14, color: '#6B6356', margin: 0, lineHeight: 1.6 },
  main: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 0' },
  section: { marginBottom: 40 },
  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 19,
    fontWeight: 700,
    margin: 0,
  },
  sectionActions: { display: 'flex', gap: 8 },
  progressNote: { fontSize: 12, color: '#8A8273' },

  secondaryBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'transparent',
    border: '1px solid #2B2724',
    color: '#2B2724',
    borderRadius: 100,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    fontWeight: 500,
  },

  emptyState: {
    border: '1px dashed #C9BFAC',
    borderRadius: 12,
    padding: '36px 20px',
    textAlign: 'center',
    color: '#8A8273',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { fontSize: 13, margin: 0, maxWidth: 320 },

  cassetteRow: {
    display: 'flex',
    gap: 14,
    overflowX: 'auto',
    paddingBottom: 8,
  },
  cassette: {
    minWidth: 168,
    borderRadius: 10,
    border: '1.5px solid',
    overflow: 'hidden',
    flexShrink: 0,
    boxShadow: '0 2px 6px rgba(43,39,36,0.08)',
  },
  cassetteLabel: {
    padding: '6px 10px',
  },
  cassetteEra: {
    fontSize: 10.5,
    color: 'white',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  cassetteBody: { padding: '12px 12px 10px', background: 'rgba(255,255,255,0.45)' },
  cassetteReels: { display: 'flex', justifyContent: 'space-between', padding: '0 8px', marginBottom: 8 },
  reel: { width: 22, height: 22, borderRadius: '50%', border: '3px solid' },
  cassetteTitle: { fontSize: 13.5, fontWeight: 700, marginBottom: 4 },
  cassetteMeta: { fontSize: 10.5, color: '#6B6356', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 },
  cassetteActions: { display: 'flex', gap: 6 },
  smallIconBtn: {
    background: 'white',
    border: '1px solid rgba(43,39,36,0.15)',
    borderRadius: 6,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },

  timeline: { display: 'flex', flexDirection: 'column' },
  timelineItem: { display: 'flex', gap: 14 },
  timelineMarker: { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18 },
  timelineDot: { width: 9, height: 9, borderRadius: '50%', background: '#B8773D', flexShrink: 0 },
  timelineLine: { width: 1.5, flex: 1, background: '#D8D0C0', marginTop: 4, marginBottom: 4, minHeight: 24 },

  chapterCard: {
    background: 'white',
    border: '1px solid #E2DBCB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chapterHeaderRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  chapterTitleInput: {
    flex: 1,
    fontFamily: "'Shippori Mincho', serif",
    fontSize: 16,
    fontWeight: 700,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: '4px 0',
    borderBottom: '1px solid transparent',
  },
  chapterTextarea: {
    width: '100%',
    border: '1px solid #E2DBCB',
    borderRadius: 8,
    padding: 10,
    fontSize: 13.5,
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.7,
    background: '#FBFAF6',
  },
  chapterFooter: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },

  stepBlock: {
    borderTop: '1px solid #EEE9DC',
    paddingTop: 12,
    marginTop: 12,
  },
  stepHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  stepNumber: {
    width: 18, height: 18, borderRadius: '50%', background: '#2B2724', color: 'white',
    fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepLabel: { fontSize: 13, fontWeight: 700, color: '#2B2724' },
  stepHint: { fontSize: 11, color: '#8A8273' },
  stepBtn: {
    background: '#2B2724', color: 'white', border: 'none',
    borderRadius: 100, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  stepBtnOutline: {
    background: 'transparent', color: '#2B2724', border: '1px solid #2B2724',
    borderRadius: 100, padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
  },
  doneLabelMuted: { fontSize: 11.5, color: '#6B6356', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 },
  regenLink: {
    background: 'none', border: 'none', color: '#B8773D', fontSize: 11,
    textDecoration: 'underline', cursor: 'pointer', padding: 0,
  },
  voiceSelect: {
    flex: 1,
    minWidth: 160,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #E2DBCB',
    fontSize: 12.5,
    background: 'white',
    color: '#2B2724',
  },
  generateBtn: {
    background: '#2B2724',
    color: 'white',
    border: 'none',
    borderRadius: 100,
    padding: '8px 16px',
    fontSize: 12.5,
    fontWeight: 600,
  },
  generatingChip: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: '#8A8273', padding: '8px 4px',
  },
  donePlayer: { display: 'flex', alignItems: 'center', gap: 8 },
  playDoneBtn: {
    width: 28, height: 28, borderRadius: '50%',
    background: '#4A5C4A', color: 'white', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  doneLabel: { fontSize: 11.5, color: '#4A5C4A', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 },

  addChapterBtn: {
    display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
    width: '100%',
    border: '1px dashed #C9BFAC',
    background: 'transparent',
    borderRadius: 10,
    padding: '12px',
    fontSize: 13,
    color: '#6B6356',
    cursor: 'pointer',
    marginTop: 6,
  },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(43,39,36,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    background: '#FBFAF6', width: '100%', maxWidth: 420,
    borderRadius: '16px 16px 0 0', padding: 20, maxHeight: '88vh', overflowY: 'auto',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: "'Shippori Mincho', serif", fontSize: 17, margin: 0 },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B6356' },

  field: { marginBottom: 12 },
  fieldLabel: { display: 'block', fontSize: 11.5, color: '#6B6356', marginBottom: 5, fontWeight: 600 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #E2DBCB', fontSize: 13.5, outline: 'none', background: 'white',
  },

  recordArea: {
    border: '1px solid #E2DBCB', borderRadius: 10, padding: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '14px 0',
  },
  recordBtn: {
    width: 56, height: 56, borderRadius: '50%', border: 'none',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  recordStatus: { fontSize: 12.5, color: '#6B6356' },
  recordedPreview: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  linkBtn: { background: 'none', border: 'none', color: '#B8773D', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
  errorText: { color: '#8C3B2E', fontSize: 12 },

  uploadBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px dashed #C9BFAC', background: 'white', fontSize: 13, cursor: 'pointer', color: '#2B2724',
  },
  analyzingRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B6356', marginTop: 10 },
  qualityNote: {
    fontSize: 12, color: '#5A3A1A', background: '#E8D4BC', padding: '8px 10px',
    borderRadius: 8, marginTop: 10, lineHeight: 1.6,
  },

  primaryBtn: {
    width: '100%', marginTop: 16,
    background: '#2B2724', color: 'white', border: 'none',
    borderRadius: 100, padding: '13px', fontSize: 14, fontWeight: 600,
  },
};
