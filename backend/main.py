"""
声の記憶帳 - バックエンドAPIサーバー

設計:
  Step 1 (読み上げ生成): 下書き音声を2通りの方法で用意できる
    - TTS合成: テキスト → AivisSpeech/Kokoro(固定ボイス) → 下書き音声
    - 本人録音: 本人が現在の声で読み上げた録音をそのままアップロード → 下書き音声
    どちらの場合も、下書き音声は声紋非依存(まだ本人の過去の声にはなっていない)。
  Step 2 (声で仕上げる): 下書き音声 + 声紋(参照音声) → KokoClone/Kanade(声質変換) → 最終音声

実行方法:
  pip install -r requirements.txt
  python setup_models.py           (初回のみ: Kokoro使用時のみモデルファイルをダウンロード)
  git clone https://github.com/Ashish-Patnaik/kokoclone.git  (Step2用)
  cd kokoclone && pip install -r requirements.txt && cd ..
  uvicorn main:app --reload --port 8000
"""

import io
import os
import sys
import json
import logging
import subprocess
import threading
import uuid
import shutil
from pathlib import Path
from typing import Optional, Literal

import numpy as np
import requests
import soundfile as sf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logger = logging.getLogger("voice-narration")

# ============================================================
# 設定
# ============================================================

BASE_DIR = Path(__file__).parent
STORAGE_DIR = BASE_DIR / "storage"
VOICE_PROFILES_DIR = STORAGE_DIR / "voice_profiles"
DRAFT_AUDIO_DIR = STORAGE_DIR / "draft_audio"
FINAL_AUDIO_DIR = STORAGE_DIR / "final_audio"
COMPARE_DIR = STORAGE_DIR / "compare"
MODELS_DIR = BASE_DIR / "models"

KOKORO_MODEL_PATH = MODELS_DIR / "kokoro-v1.0.onnx"
KOKORO_VOICES_PATH = MODELS_DIR / "voices-v1.0.bin"

KOKOCLONE_DIR = BASE_DIR / "kokoclone"

# 本人録音の下書きは恥ずかしさ・プライバシーに配慮し、静的配信されない領域に保存する
# (/files 配下にないためURLでアクセスできない。Step2の処理はファイルパス経由で行うので影響なし)
PRIVATE_DRAFT_DIR = BASE_DIR / "storage_private" / "draft_audio"

for d in [VOICE_PROFILES_DIR, DRAFT_AUDIO_DIR, FINAL_AUDIO_DIR, MODELS_DIR, PRIVATE_DRAFT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="声の記憶帳 API")

# 開発用CORS設定。本番ではフロントのドメインに限定すること。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 生成済み音声ファイルを静的配信(本番ではCDN/S3の署名付きURLに置き換え推奨)
app.mount("/files", StaticFiles(directory=str(STORAGE_DIR)), name="files")


# ============================================================
# インメモリのデータストア(プロトタイプ用。本番ではDBに置き換え)
# ============================================================

voice_profiles_db = {}   # id -> dict
chapters_db = {}         # id -> dict

# サーバー再起動で登録内容(声紋・章)が消えないよう、変更のたびにJSONへ保存し起動時に読み戻す
STATE_PATH = STORAGE_DIR / "state.json"


def _save_state() -> None:
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps({"voice_profiles": voice_profiles_db, "chapters": chapters_db}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    tmp.replace(STATE_PATH)


def _load_state() -> None:
    if not STATE_PATH.exists():
        return
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("state.jsonの読み込みに失敗したため、空の状態で起動します")
        return
    voice_profiles_db.update(state.get("voice_profiles", {}))
    chapters_db.update(state.get("chapters", {}))
    # 前回実行中に中断された処理は失敗扱いにする(UIのスピナーが永久に回るのを防ぐ)
    for chapter in chapters_db.values():
        for key in ("draft_status", "final_status"):
            if chapter.get(key) == "generating":
                chapter[key] = "failed"
                chapter["error"] = "サーバー再起動により処理が中断されました。もう一度実行してください。"


_load_state()


# ============================================================
# モデル定義(リクエスト/レスポンス)
# ============================================================

class VoiceProfileOut(BaseModel):
    id: str
    label: str
    era_tag: Optional[str] = None
    source_type: str
    audio_url: str
    duration_sec: Optional[float] = None
    quality_note: Optional[str] = None


class ChapterCreate(BaseModel):
    title: str = ""
    body: str = ""


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    voice_profile_id: Optional[str] = None


class ChapterOut(BaseModel):
    id: str
    title: str
    body: str
    voice_profile_id: Optional[str] = None
    draft_status: Literal["idle", "generating", "done", "failed"]
    draft_audio_url: Optional[str] = None
    draft_source_body: Optional[str] = None
    draft_source: Optional[Literal["tts", "recording"]] = None
    final_status: Literal["idle", "generating", "done", "failed"]
    final_audio_url: Optional[str] = None
    error: Optional[str] = None


def _chapter_out(chapter: dict) -> ChapterOut:
    # draft_audio_path は内部管理用(実ファイルパス)なのでレスポンスからは除く
    return ChapterOut(**{k: v for k, v in chapter.items() if k != "draft_audio_path"})


class ApplyVoiceRequest(BaseModel):
    voice_profile_id: str


# ============================================================
# Step 1: TTS合成による下書き音声生成(読み上げ生成)
#
# TTS_ENGINE環境変数でエンジンを切り替え可能:
#   "aivisspeech" (既定) - 日本語特化・CPU動作可・LGPL-3.0で商用利用可
#                          事前にAivisSpeech Engineを別途起動しておくこと
#   "kokoro"              - 多言語対応・Apache 2.0
# ============================================================

_kokoro_instance = None


def _get_kokoro():
    global _kokoro_instance
    if _kokoro_instance is not None:
        return _kokoro_instance

    from kokoro_onnx import Kokoro

    if not KOKORO_MODEL_PATH.exists() or not KOKORO_VOICES_PATH.exists():
        raise RuntimeError(
            f"Kokoroモデルファイルが見つかりません。"
            f"python setup_models.py を実行してダウンロードしてください。"
            f"期待パス: {KOKORO_MODEL_PATH}, {KOKORO_VOICES_PATH}"
        )

    logger.info("Kokoroモデルをロード中...")
    _kokoro_instance = Kokoro(str(KOKORO_MODEL_PATH), str(KOKORO_VOICES_PATH))
    logger.info("Kokoroモデルのロード完了")
    return _kokoro_instance


def _split_sentences(text: str) -> list[str]:
    """日本語テキストを文単位に分割する。"""
    import re
    sentences = re.split(r'(?<=[。！？\!\?\.\n])', text)
    return [s.strip() for s in sentences if s.strip()]


def run_kokoro_tts(text: str, output_path: Path) -> None:
    kokoro = _get_kokoro()

    voice = os.environ.get("KOKORO_VOICE", "jf_alpha")
    speed = float(os.environ.get("KOKORO_SPEED", "1.0"))
    lang = os.environ.get("KOKORO_LANG", "ja")

    sentences = _split_sentences(text)
    if not sentences:
        raise ValueError("読み上げるテキストが空です")

    all_samples = []
    sample_rate = None

    for sentence in sentences:
        samples, sr = kokoro.create(sentence, voice=voice, speed=speed, lang=lang)
        sample_rate = sr
        all_samples.append(samples)
        # 文間に短い無音(0.3秒)を挿入
        all_samples.append(np.zeros(int(sr * 0.3), dtype=np.float32))

    combined = np.concatenate(all_samples)
    sf.write(str(output_path), combined, sample_rate)


def run_aivisspeech_tts(text: str, output_path: Path) -> None:
    """
    AivisSpeech Engine(VOICEVOX互換HTTP API)を使ってTTSを行う。
    事前にエンジンを起動しておくこと(既定 http://localhost:10101)。

    話者(speaker_id)は必ずCC0またはACML(商用可)ライセンスの音声モデルを選ぶこと。
    ACML-NC(非商用限定)のモデルは商用利用可能な構成を保つ方針に反するため使わない。
    """
    base_url = os.environ.get("AIVISSPEECH_BASE_URL", "http://localhost:10101")
    speaker_id = int(os.environ.get("AIVISSPEECH_SPEAKER_ID", "888753760"))

    sentences = _split_sentences(text)
    if not sentences:
        raise ValueError("読み上げるテキストが空です")

    all_samples = []
    sample_rate = None

    for sentence in sentences:
        query_res = requests.post(
            f"{base_url}/audio_query",
            params={"text": sentence, "speaker": speaker_id},
            timeout=30,
        )
        query_res.raise_for_status()
        query = query_res.json()

        synth_res = requests.post(
            f"{base_url}/synthesis",
            params={"speaker": speaker_id},
            headers={"Content-Type": "application/json"},
            json=query,
            timeout=60,
        )
        synth_res.raise_for_status()

        samples, sr = sf.read(io.BytesIO(synth_res.content))
        sample_rate = sr
        all_samples.append(samples)
        all_samples.append(np.zeros(int(sr * 0.3), dtype=np.float32))

    combined = np.concatenate(all_samples)
    sf.write(str(output_path), combined, sample_rate)


def run_tts(text: str, output_path: Path) -> None:
    engine = os.environ.get("TTS_ENGINE", "aivisspeech")
    if engine == "aivisspeech":
        run_aivisspeech_tts(text, output_path)
    elif engine == "kokoro":
        run_kokoro_tts(text, output_path)
    else:
        raise ValueError(f"未対応のTTS_ENGINEです: {engine}(aivisspeech または kokoro を指定)")


# RAM15GBのこのマシンでは重い生成(TTS・声質変換・Irodori)を並行させるとOOMで落ちるため、
# 常に直列実行する
_heavy_job_lock = threading.Lock()


def process_draft_generation(chapter_id: str):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        return
    try:
        output_path = DRAFT_AUDIO_DIR / f"{chapter_id}.wav"
        with _heavy_job_lock:
            run_tts(chapter["body"], output_path)
        chapter["draft_status"] = "done"
        chapter["draft_audio_url"] = f"/files/draft_audio/{output_path.name}"
        chapter["draft_audio_path"] = str(output_path)
        chapter["draft_source_body"] = chapter["body"]
        chapter["draft_source"] = "tts"
        # 本文を元に作り直した下書きなので、古い最終音声は無効化する
        chapter["final_status"] = "idle"
        chapter["final_audio_url"] = None
    except Exception as e:
        chapter["draft_status"] = "failed"
        chapter["error"] = str(e)
    _save_state()


# ============================================================
# Step 2: KokoClone(Kanade)による声質変換(声で仕上げる)
# ============================================================

_kokoclone_instance = None


def _get_kokoclone():
    global _kokoclone_instance
    if _kokoclone_instance is not None:
        return _kokoclone_instance

    if not KOKOCLONE_DIR.exists():
        raise RuntimeError(
            f"kokocloneディレクトリが見つかりません: {KOKOCLONE_DIR}\n"
            f"git clone https://github.com/Ashish-Patnaik/kokoclone.git を実行してください。"
        )

    # kokocloneのモジュールをインポートできるようにパスを追加
    kokoclone_str = str(KOKOCLONE_DIR)
    if kokoclone_str not in sys.path:
        sys.path.insert(0, kokoclone_str)

    from core.cloner import KokoClone

    logger.info("KokoClone(Kanade)モデルをロード中...")
    _kokoclone_instance = KokoClone()
    logger.info("KokoClone(Kanade)モデルのロード完了")
    return _kokoclone_instance


def run_voice_conversion(source_audio_path: Path, reference_audio_path: Path, output_path: Path) -> None:
    cloner = _get_kokoclone()

    cloner.convert(
        source_audio=str(source_audio_path),
        reference_audio=str(reference_audio_path),
        output_path=str(output_path),
    )


# ============================================================
# Irodori-TTSによるワンショット生成(経路Bの採用方式)
# テキスト+声紋参照音声から最終音声を直接生成する(下書き・KokoClone変換を経由しない)
# ============================================================

IRODORI_DIR = Path(os.environ.get("IRODORI_DIR", str(Path.home() / "irodori-tts")))
IRODORI_CHECKPOINT = os.environ.get("IRODORI_CHECKPOINT", "Aratako/Irodori-TTS-500M-v3")


def _final_engine() -> str:
    """最終音声の生成方式。irodori(既定)=テキストから直接生成 / kokoclone=下書きを声質変換"""
    return os.environ.get("FINAL_ENGINE", "irodori")


def _find_uv() -> str:
    uv = shutil.which("uv")
    if uv:
        return uv
    fallback = Path.home() / "AppData" / "Roaming" / "Python" / "Python314" / "Scripts" / "uv.exe"
    if fallback.exists():
        return str(fallback)
    raise RuntimeError("uvが見つかりません(Irodori-TTSの実行に必要)")


def run_irodori_tts(text: str, reference_audio_path: Path, output_path: Path) -> None:
    """Irodori-TTSでテキスト+参照音声から直接生成する。

    RAM15GBのこのマシンでは長文の一括生成がOOMで無言クラッシュするため(実測)、
    2文ずつに分割して生成し、0.3秒の無音を挟んで結合する。
    """
    sentences = _split_sentences(text)
    chunks = ["".join(sentences[i:i + 2]) for i in range(0, len(sentences), 2)] or [text]
    uv = _find_uv()
    tmp_dir = FINAL_AUDIO_DIR / f"_irodori_tmp_{uuid.uuid4().hex[:8]}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        parts = []
        sample_rate = None
        for i, chunk in enumerate(chunks):
            chunk_path = tmp_dir / f"part{i}.wav"
            logger.info("Irodori-TTS生成中 (%d/%d)...", i + 1, len(chunks))
            proc = subprocess.run(
                [uv, "run", "--no-sync", "python", "infer.py",
                 "--hf-checkpoint", IRODORI_CHECKPOINT,
                 "--text", chunk,
                 "--ref-wav", str(reference_audio_path),
                 "--output-wav", str(chunk_path)],
                cwd=str(IRODORI_DIR), capture_output=True, timeout=1800,
            )
            if proc.returncode != 0 or not chunk_path.exists():
                tail = (proc.stderr or b"").decode("utf-8", errors="replace")[-500:]
                raise RuntimeError(
                    f"Irodori-TTSの生成に失敗しました({i + 1}/{len(chunks)}件目, exit={proc.returncode}): {tail}"
                )
            data, sr = sf.read(str(chunk_path))
            if data.ndim > 1:
                data = data.mean(axis=1)
            parts.append(data.astype(np.float32))
            parts.append(np.zeros(int(sr * 0.3), dtype=np.float32))
            sample_rate = sr
        sf.write(str(output_path), np.concatenate(parts), sample_rate)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def process_voice_application(chapter_id: str, voice_profile_id: str):
    chapter = chapters_db.get(chapter_id)
    profile = voice_profiles_db.get(voice_profile_id)
    if not chapter or not profile:
        return
    try:
        reference_path = Path(profile["audio_path"])
        output_path = FINAL_AUDIO_DIR / f"{chapter_id}_{voice_profile_id}.wav"

        with _heavy_job_lock:
            # 本人録音の下書きは声質変換(KokoClone)で仕上げる(録音の自然さを活かす経路A)。
            # それ以外はIrodoriワンショットで本文テキストから直接生成(採用済みの経路B)
            if _final_engine() == "irodori" and chapter.get("draft_source") != "recording":
                run_irodori_tts(chapter["body"], reference_path, output_path)
            else:
                source_path = Path(chapter["draft_audio_path"])
                run_voice_conversion(source_path, reference_path, output_path)

        chapter["final_status"] = "done"
        chapter["final_audio_url"] = f"/files/final_audio/{output_path.name}"
        chapter["voice_profile_id"] = voice_profile_id
    except Exception as e:
        chapter["final_status"] = "failed"
        chapter["error"] = str(e)
    _save_state()


# ============================================================
# 声紋API
# ============================================================

def _ensure_readable_wav(path: Path) -> Path:
    """soundfileで読めない形式(m4a/webm等のスマホ・ブラウザ録音)をffmpegで24kHzモノラルWAVに変換する。"""
    try:
        sf.info(str(path))
        return path
    except Exception:
        pass
    if shutil.which("ffmpeg") is None:
        raise HTTPException(status_code=400, detail="この音声形式を読み込めません(変換用のffmpegも見つかりません)")
    wav_path = path.with_name(path.stem + "_conv.wav")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-ac", "1", "-ar", "24000", str(wav_path)],
        capture_output=True,
    )
    if proc.returncode != 0 or not wav_path.exists():
        raise HTTPException(status_code=400, detail="音声の変換に失敗しました。対応形式(wav/mp3/m4a/webm等)か確認してください")
    path.unlink(missing_ok=True)
    return wav_path


def _preprocess_voice_profile_audio(path: Path) -> tuple[Optional[float], str]:
    """
    声紋用音声の軽量な前処理。
    方針: 過去の実録音(古いビデオ、ボイスメモ等)の「当時の質感」を残すため、
    ノイズ除去や強い補正はせず、DCオフセット除去とピークレベル正規化のみ行う。
    """
    try:
        data, sr = sf.read(str(path), always_2d=False)
    except Exception as e:
        return None, f"前処理をスキップしました(音声の読み込みに失敗: {e})。アップロードした音声をそのまま使用します。"

    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)

    data = data - np.mean(data)

    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 1e-6:
        data = data / peak * 0.95

    sf.write(str(path), data, sr)
    duration_sec = (len(data) / sr) if sr else None
    return duration_sec, "軽量な前処理を実施(DCオフセット除去・ピークレベル正規化)。ノイズ除去や強い補正は行っていません(当時の質感を残す方針)。"


@app.post("/api/voice-profiles", response_model=VoiceProfileOut)
async def create_voice_profile(
    label: str = Form(...),
    era_tag: Optional[str] = Form(None),
    source_type: str = Form("アップロード素材"),
    audio: UploadFile = File(...),
):
    profile_id = str(uuid.uuid4())
    ext = Path(audio.filename).suffix or ".wav"
    saved_path = VOICE_PROFILES_DIR / f"{profile_id}{ext}"

    with saved_path.open("wb") as f:
        shutil.copyfileobj(audio.file, f)

    saved_path = _ensure_readable_wav(saved_path)
    duration_sec, quality_note = _preprocess_voice_profile_audio(saved_path)

    profile = {
        "id": profile_id,
        "label": label,
        "era_tag": era_tag,
        "source_type": source_type,
        "audio_path": str(saved_path),
        "audio_url": f"/files/voice_profiles/{saved_path.name}",
        "duration_sec": duration_sec,
        "quality_note": quality_note,
    }
    voice_profiles_db[profile_id] = profile
    _save_state()
    return VoiceProfileOut(**{k: v for k, v in profile.items() if k != "audio_path"})


@app.get("/api/voice-profiles", response_model=list[VoiceProfileOut])
async def list_voice_profiles():
    return [
        VoiceProfileOut(**{k: v for k, v in p.items() if k != "audio_path"})
        for p in voice_profiles_db.values()
    ]


@app.delete("/api/voice-profiles/{profile_id}")
async def delete_voice_profile(profile_id: str):
    profile = voice_profiles_db.pop(profile_id, None)
    if not profile:
        raise HTTPException(status_code=404, detail="声紋が見つかりません")
    # 紐づいている章の voice_profile_id をクリア
    for chapter in chapters_db.values():
        if chapter.get("voice_profile_id") == profile_id:
            chapter["voice_profile_id"] = None
    try:
        os.remove(profile["audio_path"])
    except OSError:
        pass
    _save_state()
    return {"deleted": True}


# ============================================================
# 章API
# ============================================================

@app.post("/api/chapters", response_model=ChapterOut)
async def create_chapter(payload: ChapterCreate):
    chapter_id = str(uuid.uuid4())
    chapter = {
        "id": chapter_id,
        "title": payload.title,
        "body": payload.body,
        "voice_profile_id": None,
        "draft_status": "idle",
        "draft_audio_url": None,
        "draft_audio_path": None,
        "draft_source_body": None,
        "draft_source": None,
        "final_status": "idle",
        "final_audio_url": None,
        "error": None,
    }
    chapters_db[chapter_id] = chapter
    _save_state()
    return _chapter_out(chapter)


@app.get("/api/chapters", response_model=list[ChapterOut])
async def list_chapters():
    return [_chapter_out(c) for c in chapters_db.values()]


@app.patch("/api/chapters/{chapter_id}", response_model=ChapterOut)
async def update_chapter(chapter_id: str, payload: ChapterUpdate):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    if payload.title is not None:
        chapter["title"] = payload.title
    if payload.body is not None:
        chapter["body"] = payload.body
    if payload.voice_profile_id is not None:
        chapter["voice_profile_id"] = payload.voice_profile_id
    _save_state()
    return _chapter_out(chapter)


@app.delete("/api/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str):
    if chapter_id not in chapters_db:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    del chapters_db[chapter_id]
    _save_state()
    return {"deleted": True}


@app.post("/api/chapters/{chapter_id}/generate-draft", status_code=202)
async def generate_draft(chapter_id: str, background_tasks: BackgroundTasks):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    if not chapter["body"].strip():
        raise HTTPException(status_code=400, detail="本文が空です")

    chapter["draft_status"] = "generating"
    chapter["error"] = None
    _save_state()
    background_tasks.add_task(process_draft_generation, chapter_id)
    return {"accepted": True}


@app.post("/api/chapters/{chapter_id}/upload-draft", response_model=ChapterOut)
async def upload_draft(chapter_id: str, audio: UploadFile = File(...)):
    """
    本人が現在の声で読み上げた録音を、下書き音声としてそのまま登録する。
    TTS合成を経由しないため、ナレーションの自然さが最初から保証される。
    Step2(声質変換)は通常のTTS下書きと同じ扱いで適用できる。
    """
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")

    ext = Path(audio.filename).suffix or ".wav"
    output_path = PRIVATE_DRAFT_DIR / f"{chapter_id}{ext}"

    with output_path.open("wb") as f:
        shutil.copyfileobj(audio.file, f)

    output_path = _ensure_readable_wav(output_path)

    chapter["draft_status"] = "done"
    # 本人録音は配信しない(URLなし)。Step2には draft_audio_path 経由で使われる
    chapter["draft_audio_url"] = None
    chapter["draft_audio_path"] = str(output_path)
    chapter["draft_source_body"] = chapter["body"]
    chapter["draft_source"] = "recording"
    chapter["error"] = None
    # 下書きが差し替わったので、古い最終音声は無効化する
    chapter["final_status"] = "idle"
    chapter["final_audio_url"] = None
    _save_state()
    return _chapter_out(chapter)


@app.post("/api/chapters/{chapter_id}/apply-voice", status_code=202)
async def apply_voice(chapter_id: str, payload: ApplyVoiceRequest, background_tasks: BackgroundTasks):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    # Irodori直接生成モードでは下書き不要(本文テキストから直接生成する)。
    # 本人録音がある場合は従来どおり声質変換なので下書き必須
    irodori_direct = _final_engine() == "irodori" and chapter.get("draft_source") != "recording"
    if irodori_direct:
        if not chapter["body"].strip():
            raise HTTPException(status_code=400, detail="本文が空です")
    elif chapter["draft_status"] != "done":
        raise HTTPException(status_code=400, detail="先に読み上げ生成(Step1)を完了してください")
    if payload.voice_profile_id not in voice_profiles_db:
        raise HTTPException(status_code=404, detail="指定された声紋が見つかりません")

    chapter["final_status"] = "generating"
    chapter["error"] = None
    _save_state()
    background_tasks.add_task(process_voice_application, chapter_id, payload.voice_profile_id)
    return {"accepted": True}


@app.get("/api/chapters/{chapter_id}/status", response_model=ChapterOut)
async def get_chapter_status(chapter_id: str):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    return _chapter_out(chapter)


def _listening_entry(path: Path, url_prefix: str, label: Optional[str] = None) -> dict:
    try:
        info = sf.info(str(path))
        seconds = round(info.frames / info.samplerate, 1)
    except Exception:
        seconds = None
    return {"name": path.name, "label": label, "url": f"{url_prefix}/{path.name}", "seconds": seconds}


@app.get("/api/listening")
async def list_listening_audio():
    """試聴室(フロントの試聴画面)用に、配信してよい生成音声の一覧を返す。

    対象は聴き比べ音声(storage/compare)と変換済みの章音声(storage/final_audio)のみ。
    本人録音の下書きはstorage_private配下にあり、この一覧にも/files配信にも含まれない。
    """
    compare = [
        _listening_entry(f, "/files/compare")
        for f in sorted(COMPARE_DIR.glob("*.wav")) if COMPARE_DIR.is_dir()
    ]
    final = []
    if FINAL_AUDIO_DIR.is_dir():
        for f in sorted(FINAL_AUDIO_DIR.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True):
            # ファイル名は {chapter_id}_{profile_id}.wav。サーバー再起動でin-memory DBが
            # 消えている場合は解決できないので、ラベルなし(ファイル名表示)になる
            label = None
            parts = f.stem.split("_")
            if len(parts) == 2:
                chapter = chapters_db.get(parts[0])
                profile = voice_profiles_db.get(parts[1])
                if chapter or profile:
                    label = f"{chapter['title'] if chapter else '章'} × {profile['label'] if profile else '声紋'}"
            final.append(_listening_entry(f, "/files/final_audio", label))
    return {"compare": compare, "final": final}


@app.get("/")
async def root():
    return {"status": "ok", "service": "voice-narration-backend", "final_engine": _final_engine()}


# ビルド済みフロントエンド(frontend/dist)があれば http://localhost:8000/app/ で配信する。
# これで常駐バックエンドだけ動いていれば、npm run dev なしでUIにアクセスできる。
# 反映するには frontend で `npm run build` が必要(vite.config.jsのbaseは相対パス)。
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
