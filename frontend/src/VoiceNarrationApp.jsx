import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Upload, Play, Pause, Plus, X, Check, Loader2, FileAudio, Clock, BookOpen, Trash2 } from 'lucide-react';
import { COLORS, ERA_COLORS, ERA_PALETTE, FONT_HERO, FONT_DISPLAY, FONT_BODY, FONT_MONO } from './theme';
import { Waveform } from './Waveform';
import { SpectralBloom, SignalDot } from './SpectralBloom';

// ============================================================
// データモデル(設計通りの構造をフロントの状態として再現)
// VoiceProfile { id, label, eraTag, sourceType, audioUrl, durationSec, qualityNote, createdAt }
// Chapter { id, title, body, voiceProfileId, status, generatedAudioUrl }
// ============================================================

// 声紋の新規録音時に読んでもらう台本の候補。
// 「ランダムに何か話してください」だと本人も困るうえ、声質の再現度にも影響するため、
// 日本語の音素バランスを考慮した台本例を提示する。
// 出典: ITAコーパス(パブリックドメイン。SSS合同会社・明治大学・九州工業大学が共同開発)
//       https://github.com/mmorise/ita-corpus
// 424文の中から、読みやすく短いものを8文抜粋している。
const SUGGESTED_SCRIPT = [
  '社長からの指示です。',
  '猫はにゃーにゃーと鳴く。',
  '私はこの本に八百円を払った。',
  'チョコの在庫あったかな？',
  'すみません、この辺に詳しくないんです。',
  '結局のところお互い五十歩百歩だ。',
  '客人をもてなすのは当然です。',
  'この丘からは何百万という星が見える。',
];

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
  const [showScript, setShowScript] = useState(true);
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

        {showScript && (
          <div style={styles.scriptBox}>
            <div style={styles.scriptBoxHeader}>
              <span>読む内容に迷ったら、この台本をどうぞ</span>
              <button onClick={() => setShowScript(false)} style={styles.linkBtn}>隠す</button>
            </div>
            <ol style={styles.scriptList}>
              {SUGGESTED_SCRIPT.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
            <div style={styles.scriptNote}>
              日本語の音素バランスを考慮した文例(ITAコーパスより抜粋・パブリックドメイン)。
              自然に話せる内容があれば、それを話していただいても構いません。
            </div>
          </div>
        )}
        {!showScript && !audioUrl && (
          <button onClick={() => setShowScript(true)} style={styles.linkBtn}>台本を表示する</button>
        )}

        <div style={styles.recordArea}>
          {!audioUrl ? (
            <>
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{
                  ...styles.recordBtn,
                  background: recording ? COLORS.rose : COLORS.spectralGradient,
                  boxShadow: recording ? `0 0 0 6px ${COLORS.roseSoft}` : `0 0 0 6px ${COLORS.panelRaised}`,
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
          className="vm-btn-primary"
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
          className="vm-btn-primary"
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
        <p style={{ fontSize: 12.5, color: COLORS.mistSoft, margin: '0 0 14px', lineHeight: 1.6 }}>
          この章の本文を、本人が現在の声で読み上げてください。TTS合成を使わないため、
          読み上げの自然さがそのまま活きます。声質変換(Step2)で年代の声に仕上げられます。
        </p>

        {!audioUrl ? (
          <>
            <div style={styles.recordArea}>
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{
                  ...styles.recordBtn,
                  background: recording ? COLORS.rose : COLORS.spectralGradient,
                  boxShadow: recording ? `0 0 0 6px ${COLORS.roseSoft}` : `0 0 0 6px ${COLORS.panelRaised}`,
                }}
              >
                {recording ? <Square size={22} fill="white" /> : <Mic size={22} />}
              </button>
              <div style={styles.recordStatus}>
                {recording ? `録音中... ${formatTime(duration)}` : '録音を開始するにはタップ'}
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: 11.5, color: COLORS.mistFaint, margin: '10px 0' }}>または</div>

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
          className="vm-btn-primary"
          style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
        >
          {saving ? 'アップロード中...' : 'この録音を下書きにする'}
        </button>
      </div>
    </div>
  );
}

// ----- 信号readout(観測パネルの数値表示) -----
function ReadoutStat({ label, value }) {
  return (
    <div style={styles.readoutStat}>
      <span style={styles.readoutStatValue}>{value}</span>
      <span style={styles.readoutStatLabel}>{label}</span>
    </div>
  );
}

// ----- 声紋の信号カード -----
// 声紋を「一つの受信チャンネル」として、横並びのカードで見せる。
// 選ぶと下の観測パネルに「同調」し、そのチャンネルの波形が読み取られる。
function SignalCard({ profile, colorKey, active, onSelect }) {
  const c = ERA_COLORS[colorKey];
  return (
    <button
      className="vm-signal-card"
      onClick={onSelect}
      style={{
        ...styles.signalCard,
        background: active ? c.bgSoft : COLORS.panel,
        borderColor: active ? c.bg : COLORS.line,
        boxShadow: active ? `0 0 0 1px ${c.bg}, 0 0 18px ${c.bg}33` : 'none',
      }}
    >
      <span style={{ ...styles.signalCardDot, background: c.bg, boxShadow: active ? `0 0 8px ${c.bg}` : 'none' }} />
      <span style={styles.signalCardLabel}>{profile.label}</span>
      <span style={{ ...styles.signalCardEra, color: c.text }}>{profile.eraTag || '年代未設定'}</span>
    </button>
  );
}

// ----- 観測パネル -----
// 同調中(選択中)の声紋だけが、この受信窓で波形として読み取られる。
function SignalReader({ profile, colorKey, isPlaying, onTogglePlay, onDelete }) {
  const c = ERA_COLORS[colorKey];
  return (
    <div style={styles.reader}>
      <div style={styles.readerGlow} />
      <div style={styles.readerInfo}>
        <div style={styles.readerTitleRow}>
          <span style={{ ...styles.readerEraTag, background: c.bg }}>{profile.eraTag || '年代未設定'}</span>
          <span style={styles.readerTitle}>{profile.label}</span>
        </div>
        <div style={styles.readerMeta}>
          <FileAudio size={11} /> {profile.sourceType}
          {profile.durationSec != null && <> · <Clock size={11} style={{ marginLeft: 4 }} /> {formatTime(profile.durationSec)}</>}
        </div>
        <Waveform active={isPlaying} size="lg" bars={22} color={isPlaying ? c.bg : COLORS.mistFaint} />
      </div>
      <div style={styles.readerActions}>
        <button onClick={() => onTogglePlay(profile.id)} style={{ ...styles.readerPlayBtn, background: c.bg }}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={() => onDelete(profile.id)} style={styles.readerIconBtn}>
          <Trash2 size={14} />
        </button>
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
function ChapterCard({ chapter, voiceProfiles, finalEngine, onUpdate, onDelete, onGenerateDraft, onOpenDraftUpload, onApplyVoice, playingChapterId, onTogglePlay }) {
  const profile = voiceProfiles.find((p) => p.id === chapter.voiceProfileId);
  const isPlayingDraft = playingChapterId === `draft-${chapter.id}`;
  const isPlayingFinal = playingChapterId === `final-${chapter.id}`;
  const hasDraft = chapter.draftStatus === 'done';
  const bodyChangedSinceDraft = hasDraft && chapter.draftSourceBody !== chapter.body;
  const isRecordingDraft = chapter.draftSource === 'recording';
  // Irodori直接生成: 本人録音がない章は、本文テキスト+声紋だけでStep2に進める(下書き不要)
  const directMode = finalEngine === 'irodori' && !isRecordingDraft;
  const step2Ready = hasDraft || (directMode && !!chapter.body.trim());
  // スリム化: 直接生成モードで下書きが何もない章はStep1自体を出さない(テキスト→生成の一本道)
  const step1Hidden = directMode && !hasDraft && chapter.draftStatus === 'idle';

  return (
    <div className="vm-chapter-card" style={styles.chapterCard}>
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

      {/* 直接生成モードのデフォルト経路ではStep1を畳み、必要な人だけ本人録音に切り替えられるようにする */}
      {step1Hidden && (
        <button onClick={() => onOpenDraftUpload(chapter.id)} style={styles.regenLink}>
          本人の声で録音したい場合はこちら(任意)
        </button>
      )}

      {/* Step 1: 下書き音声を用意する(声紋非依存)。直接生成モードでは非表示 */}
      {!step1Hidden && (
      <div style={styles.stepBlock}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNumber}>01</span>
          <span style={styles.stepLabel}>下書き音声を用意する{directMode ? '(任意)' : ''}</span>
          <span style={styles.stepHint}>
            {directMode
              ? '本人の実録音を使いたい場合のみ。テキストからの生成は下書きなしでStep2に進めます'
              : '本人の実録音、またはTTS合成(声質はまだ年代の声ではありません)'}
          </span>
        </div>

        {chapter.draftStatus === 'idle' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="vm-btn-step" onClick={() => onOpenDraftUpload(chapter.id)} style={styles.stepBtn}>
              本人の声で録音/アップロード
            </button>
            <button
              disabled={!chapter.body.trim()}
              onClick={() => onGenerateDraft(chapter.id)}
              className="vm-btn-step"
              style={{ ...styles.stepBtnOutline, opacity: !chapter.body.trim() ? 0.4 : 1, cursor: !chapter.body.trim() ? 'not-allowed' : 'pointer' }}
            >
              TTSで読み上げを生成
            </button>
          </div>
        )}
        {chapter.draftStatus === 'generating' && (
          <div style={styles.generatingChip}>
            <SignalDot />
            <Waveform active size="sm" color={COLORS.spectral2} />
            読み上げ生成中...
          </div>
        )}
        {hasDraft && (
          <div style={styles.donePlayer}>
            {chapter.draftAudioUrl && (
              <button onClick={() => onTogglePlay(`draft-${chapter.id}`)} style={{ ...styles.playDoneBtn, background: COLORS.panelRaised, color: COLORS.mist }}>
                {isPlayingDraft ? <Pause size={14} /> : <Play size={14} />}
              </button>
            )}
            <span style={styles.doneLabelMuted}>
              <Check size={12} /> {isRecordingDraft ? '本人録音あり(非公開)' : 'TTS下書きあり'}
            </span>
            <Waveform active={isPlayingDraft} size="sm" color={COLORS.mistFaint} />
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
      )}

      {/* Step 2: 声紋で肉付け(Irodori直接生成 または 声質変換) */}
      <div style={{ ...styles.stepBlock, opacity: step2Ready ? 1 : 0.45 }}>
        <div style={styles.stepHeader}>
          <span style={styles.stepNumber}>{step1Hidden ? '01' : '02'}</span>
          <span style={styles.stepLabel}>この声で仕上げる</span>
          <span style={styles.stepHint}>
            {directMode
              ? '本文テキスト+声紋から直接生成します(Irodoriワンショット)'
              : '声紋ベクトルを下書きに反映し、本人の声質に変換'}
          </span>
        </div>

        <div style={styles.chapterFooter}>
          <select
            disabled={!step2Ready}
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
              disabled={!step2Ready || !chapter.voiceProfileId}
              onClick={() => onApplyVoice(chapter.id)}
              className="vm-btn-generate"
              style={{
                ...styles.generateBtn,
                opacity: (!step2Ready || !chapter.voiceProfileId) ? 0.4 : 1,
                cursor: (!step2Ready || !chapter.voiceProfileId) ? 'not-allowed' : 'pointer',
              }}
            >
              この声で仕上げる
            </button>
          )}
          {chapter.finalStatus === 'generating' && (
            <div style={styles.generatingChip}>
              <SignalDot />
              <Waveform active size="sm" color={COLORS.spectral2} />
              {directMode ? '音声を生成中...(数分かかります)' : '声質変換中...'}
            </div>
          )}
        </div>

        {chapter.finalStatus === 'done' && (
          <div style={styles.donePlayer}>
            <button onClick={() => onTogglePlay(`final-${chapter.id}`)} style={styles.playDoneBtn}>
              {isPlayingFinal ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <span style={styles.doneLabel}><Check size={12} /> 完成({profile?.label})</span>
            <Waveform active={isPlayingFinal} size="sm" color={COLORS.mint} />
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
  const [focusedProfileId, setFocusedProfileId] = useState(null);
  const [playingChapterId, setPlayingChapterId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  // 最終音声の生成方式(サーバー設定): 'irodori'=テキストから直接生成(下書き不要) / 'kokoclone'=下書きを声質変換
  const [finalEngine, setFinalEngine] = useState(null);

  // 初期ロード: サーバーから声紋・章の一覧を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profilesRes, chaptersRes, rootRes] = await Promise.all([
          apiFetch('/api/voice-profiles'),
          apiFetch('/api/chapters'),
          apiFetch('/'),
        ]);
        if (cancelled) return;
        setVoiceProfiles(profilesRes.map(mapVoiceProfile));
        setChapters(chaptersRes.map(mapChapter));
        setFinalEngine(rootRes?.final_engine || null);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 未選択・削除された場合は先頭の声紋に同調する
  useEffect(() => {
    if (voiceProfiles.length === 0) { setFocusedProfileId(null); return; }
    if (!voiceProfiles.some((p) => p.id === focusedProfileId)) {
      setFocusedProfileId(voiceProfiles[0].id);
    }
  }, [voiceProfiles, focusedProfileId]);

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
  const anyGenerating = chapters.some((c) => c.draftStatus === 'generating' || c.finalStatus === 'generating');
  const focusedProfile = voiceProfiles.find((p) => p.id === focusedProfileId) || null;
  const focusedColorKey = ERA_PALETTE[Math.max(0, voiceProfiles.findIndex((p) => p.id === focusedProfileId)) % ERA_PALETTE.length];

  return (
    <div style={styles.app}>
      <style>{`
        .vm-signal-card { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
        .vm-signal-card:hover { transform: translateY(-2px); }
        .vm-chapter-card { transition: box-shadow 0.22s ease, border-color 0.22s ease; animation: riseIn 0.4s ease both; }
        .vm-chapter-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.35); border-color: ${COLORS.spectral1}; }
        .vm-btn-primary, .vm-btn-generate, .vm-btn-step { transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease; }
        .vm-btn-primary:hover, .vm-btn-generate:hover, .vm-btn-step:hover { transform: translateY(-1px); filter: brightness(1.12); }
        .vm-btn-primary:active, .vm-btn-generate:active, .vm-btn-step:active { transform: translateY(0); }
      `}</style>
      <header style={styles.header}>
        <div style={styles.headerBloom}><SpectralBloom bars={48} height={210} active /></div>
        <div style={styles.headerScrim} />
        <div style={styles.headerInner}>
          <div style={styles.brandRow}>
            <div style={styles.brandPlate}>
              <span style={styles.brandModel}>STATION SV-01</span>
              <span style={styles.brandEyebrow}>VOICE SIGNAL OBSERVATORY</span>
            </div>
            <div style={styles.readoutRow}>
              <ReadoutStat label="声紋" value={String(voiceProfiles.length).padStart(2, '0')} />
              <ReadoutStat label="完成章" value={`${doneCount}/${chapters.length}`} />
            </div>
          </div>
          <h1 style={styles.headerTitle}>声の記憶帳</h1>
          <p style={styles.headerSub}>過去の録音から声紋を集め、人生の章ごとにその声でナレーションする</p>
          <div style={styles.statusRow}>
            <SignalDot />
            <span style={styles.statusText}>
              {loading || anyGenerating ? '過去の声を、今読み取っています' : '受信待機中'}
            </span>
          </div>
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
            <>
              <div style={styles.signalRow}>
                {voiceProfiles.map((p, i) => (
                  <SignalCard
                    key={p.id}
                    profile={p}
                    colorKey={ERA_PALETTE[i % ERA_PALETTE.length]}
                    active={focusedProfileId === p.id}
                    onSelect={() => setFocusedProfileId(p.id)}
                  />
                ))}
              </div>
              {focusedProfile && (
                <SignalReader
                  profile={focusedProfile}
                  colorKey={focusedColorKey}
                  isPlaying={playingProfileId === focusedProfile.id}
                  onTogglePlay={togglePlayProfile}
                  onDelete={deleteVoiceProfile}
                />
              )}
            </>
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
                  <div style={styles.chapterCounter}>{String(i + 1).padStart(3, '0')}</div>
                  {i < chapters.length - 1 && <div style={styles.spectralThread} />}
                </div>
                <div style={{ flex: 1 }}>
                  <ChapterCard
                    chapter={c}
                    voiceProfiles={voiceProfiles}
                    finalEngine={finalEngine}
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
    background: COLORS.void,
    fontFamily: FONT_BODY,
    color: COLORS.mist,
    paddingBottom: 80,
  },
  connectionError: {
    background: COLORS.roseSoft,
    color: '#FFB3C0',
    border: `1px solid ${COLORS.rose}`,
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 12.5,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  loadingRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, color: COLORS.mistSoft, marginBottom: 20,
  },
  header: {
    position: 'relative',
    overflow: 'hidden',
    padding: '28px 20px 36px',
    background: COLORS.voidDeep,
    borderBottom: `1px solid ${COLORS.line}`,
  },
  headerBloom: {
    position: 'absolute',
    inset: '0 0 0 0',
    opacity: 0.9,
    pointerEvents: 'none',
  },
  headerScrim: {
    position: 'absolute',
    inset: 0,
    background: `linear-gradient(180deg, ${COLORS.voidDeep} 0%, rgba(5,5,9,0.35) 42%, rgba(5,5,9,0.55) 68%, ${COLORS.voidDeep} 100%)`,
    pointerEvents: 'none',
  },
  headerInner: { maxWidth: 720, margin: '0 auto', position: 'relative' },
  brandRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 26, flexWrap: 'wrap', gap: 12,
  },
  brandPlate: { display: 'flex', flexDirection: 'column', gap: 4 },
  brandModel: {
    fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
    color: COLORS.spectral2,
  },
  brandEyebrow: {
    fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.14em',
    color: COLORS.mistFaint,
  },
  readoutRow: { display: 'flex', gap: 8 },
  readoutStat: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 4,
    padding: '5px 10px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    minWidth: 46,
  },
  readoutStatValue: {
    fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: COLORS.mist,
  },
  readoutStatLabel: { fontFamily: FONT_MONO, fontSize: 8, letterSpacing: '0.08em', color: COLORS.mistFaint },
  headerTitle: {
    fontFamily: FONT_HERO,
    fontSize: 'clamp(36px, 7vw, 56px)',
    fontWeight: 400,
    color: COLORS.mist,
    margin: '0 0 12px',
    letterSpacing: '0.01em',
    lineHeight: 1.2,
  },
  headerSub: { fontSize: 14, color: COLORS.mistSoft, margin: '0 0 18px', lineHeight: 1.7, maxWidth: 480 },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 9,
    paddingTop: 18,
    borderTop: `1px solid ${COLORS.line}`,
  },
  statusText: { fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: '0.04em', color: COLORS.mistSoft },
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
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    color: COLORS.mist,
  },
  sectionActions: { display: 'flex', gap: 8 },
  progressNote: { fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.mistFaint, letterSpacing: '0.02em' },

  secondaryBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'transparent',
    border: `1px solid ${COLORS.lineBright}`,
    color: COLORS.mist,
    borderRadius: 100,
    padding: '7px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    fontWeight: 500,
  },

  emptyState: {
    border: `1px dashed ${COLORS.line}`,
    borderRadius: 12,
    padding: '36px 20px',
    textAlign: 'center',
    color: COLORS.mistSoft,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { fontSize: 13, margin: 0, maxWidth: 320 },

  // 声紋の受信チャンネル一覧。横並びのカードで、選ぶと下の観測パネルに同調する
  signalRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 6,
  },
  signalCard: {
    minWidth: 128,
    borderRadius: 8,
    border: '1.5px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    padding: '10px 12px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  signalCardDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  signalCardLabel: { fontSize: 12.5, fontWeight: 700, color: COLORS.mist },
  signalCardEra: { fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em' },

  // 観測パネル: 同調中の声紋が波形として読み取られる受信窓
  reader: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
    background: COLORS.panel,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: '16px 18px',
    overflow: 'hidden',
  },
  readerGlow: {
    position: 'absolute', inset: 0,
    background: COLORS.spectralGradientSoft,
    opacity: 0.4,
    pointerEvents: 'none',
  },
  readerInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' },
  readerTitleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  readerEraTag: {
    fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 700, color: COLORS.void,
    padding: '2px 7px', borderRadius: 4, letterSpacing: '0.04em',
  },
  readerTitle: { fontSize: 14.5, fontWeight: 700, color: COLORS.mist },
  readerMeta: {
    fontFamily: FONT_MONO, fontSize: 10, color: COLORS.mistFaint,
    display: 'flex', alignItems: 'center', gap: 4,
  },
  readerActions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' },
  readerPlayBtn: {
    width: 36, height: 36, borderRadius: '50%',
    color: COLORS.void, border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  readerIconBtn: {
    background: COLORS.panelRaised,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 6,
    width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    color: COLORS.rose,
    flexShrink: 0,
  },
  smallIconBtn: {
    background: COLORS.panelRaised,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 6,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: COLORS.mistSoft,
  },

  timeline: { display: 'flex', flexDirection: 'column' },
  timelineItem: { display: 'flex', gap: 14 },
  timelineMarker: { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18 },
  // 章立ては実際に順序を持つ情報なので、番号にちゃんと意味がある
  chapterCounter: {
    background: COLORS.panelRaised,
    color: COLORS.mist,
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.03em',
    borderRadius: 4,
    padding: '4px 6px',
    boxShadow: `inset 0 0 0 1px ${COLORS.line}`,
    flexShrink: 0,
  },
  // スペクトルの光の糸。ヒーローの信号帯と同じモチーフを、章と章をつなぐ線として反復する
  spectralThread: {
    width: 2,
    flex: 1,
    marginTop: 6,
    marginBottom: 4,
    minHeight: 20,
    background: COLORS.spectralGradient,
    opacity: 0.5,
    borderRadius: 1,
  },

  chapterCard: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chapterHeaderRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  chapterTitleInput: {
    flex: 1,
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    fontWeight: 700,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: '4px 0',
    borderBottom: '1px solid transparent',
    color: COLORS.mist,
  },
  chapterTextarea: {
    width: '100%',
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    padding: 10,
    fontSize: 13.5,
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.7,
    background: COLORS.panelRaised,
    color: COLORS.mist,
  },
  chapterFooter: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },

  stepBlock: {
    borderTop: `1px solid ${COLORS.line}`,
    paddingTop: 12,
    marginTop: 12,
  },
  stepHeader: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, flexWrap: 'wrap' },
  stepNumber: {
    width: 24, height: 19, borderRadius: 3,
    background: COLORS.panelRaised, color: COLORS.spectral2,
    fontFamily: FONT_MONO,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: `inset 0 0 0 1px ${COLORS.line}`,
  },
  stepLabel: { fontSize: 13, fontWeight: 700, color: COLORS.mist },
  stepHint: { fontSize: 11, color: COLORS.mistFaint },
  stepBtn: {
    background: COLORS.spectralGradient, color: COLORS.void, border: 'none',
    borderRadius: 100, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },
  stepBtnOutline: {
    background: 'transparent', color: COLORS.mist, border: `1px solid ${COLORS.lineBright}`,
    borderRadius: 100, padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
  },
  doneLabelMuted: { fontSize: 11.5, color: COLORS.mistSoft, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 },
  regenLink: {
    background: 'none', border: 'none', color: COLORS.spectral2, fontSize: 11,
    textDecoration: 'underline', cursor: 'pointer', padding: 0,
  },
  voiceSelect: {
    flex: 1,
    minWidth: 160,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${COLORS.line}`,
    fontSize: 12.5,
    background: COLORS.panelRaised,
    color: COLORS.mist,
  },
  generateBtn: {
    background: COLORS.spectralGradient,
    color: COLORS.void,
    border: 'none',
    borderRadius: 100,
    padding: '8px 16px',
    fontSize: 12.5,
    fontWeight: 700,
  },
  // 生成中インジケータ: 信号灯+波形で「AIが今処理している」ことを示す
  generatingChip: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: COLORS.mistSoft, padding: '8px 4px',
  },
  donePlayer: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  playDoneBtn: {
    width: 28, height: 28, borderRadius: '50%',
    background: COLORS.mint, color: COLORS.mintDeep, border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  doneLabel: { fontSize: 11.5, color: COLORS.mint, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 },

  addChapterBtn: {
    display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
    width: '100%',
    border: `1px dashed ${COLORS.line}`,
    background: 'transparent',
    borderRadius: 10,
    padding: '12px',
    fontSize: 13,
    color: COLORS.mistSoft,
    cursor: 'pointer',
    marginTop: 6,
  },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(5,5,9,0.72)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    background: COLORS.panel, width: '100%', maxWidth: 420,
    borderRadius: '16px 16px 0 0', padding: 20, maxHeight: '88vh', overflowY: 'auto',
    border: `1px solid ${COLORS.line}`, borderBottom: 'none',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, margin: 0, color: COLORS.mist },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: COLORS.mistSoft },

  field: { marginBottom: 12 },
  fieldLabel: { display: 'block', fontSize: 11.5, color: COLORS.mistSoft, marginBottom: 5, fontWeight: 600 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${COLORS.line}`, fontSize: 13.5, outline: 'none',
    background: COLORS.panelRaised, color: COLORS.mist,
  },

  scriptBox: {
    border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: '12px 14px',
    background: COLORS.panelRaised, marginTop: 4,
  },
  scriptBoxHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: COLORS.mistSoft, fontWeight: 600, marginBottom: 8,
  },
  scriptList: {
    margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5,
    fontSize: 13.5, lineHeight: 1.6, color: COLORS.mist,
  },
  scriptNote: {
    fontSize: 10.5, color: COLORS.mistFaint, marginTop: 10, lineHeight: 1.5,
  },

  recordArea: {
    border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '14px 0',
  },
  recordBtn: {
    width: 56, height: 56, borderRadius: '50%', border: 'none',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  recordStatus: { fontFamily: FONT_MONO, fontSize: 12, color: COLORS.mistSoft },
  recordedPreview: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  linkBtn: { background: 'none', border: 'none', color: COLORS.spectral2, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
  errorText: { color: COLORS.rose, fontSize: 12 },

  uploadBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px dashed ${COLORS.line}`, background: COLORS.panelRaised, fontSize: 13, cursor: 'pointer', color: COLORS.mist,
  },
  analyzingRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: COLORS.mistSoft, marginTop: 10 },
  qualityNote: {
    fontSize: 12, color: COLORS.mistSoft, background: COLORS.panelRaised, padding: '8px 10px',
    borderRadius: 8, marginTop: 10, lineHeight: 1.6,
  },

  primaryBtn: {
    width: '100%', marginTop: 16,
    background: COLORS.spectralGradient, color: COLORS.void, border: 'none',
    borderRadius: 100, padding: '13px', fontSize: 14, fontWeight: 700,
  },
};
