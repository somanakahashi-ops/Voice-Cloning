"""
声の記憶帳 - バックエンドAPIサーバー

設計:
  Step 1 (読み上げ生成): テキスト → Kokoro(素のTTS、固定ボイス) → 下書き音声
  Step 2 (声で仕上げる): 下書き音声 + 声紋(参照音声) → KokoClone/Kanade(声質変換) → 最終音声

実行方法:
  pip install fastapi uvicorn python-multipart kokoro-onnx soundfile
  git clone https://github.com/Ashish-Patnaik/kokoclone.git  (Step2用、別途セットアップ)
  uvicorn main:app --reload --port 8000

注意:
  - Step1のKokoroと、Step2のKokoClone(Kanade)は別々のモデルロードが必要。
    本番ではメモリ・GPU資源を考え、ワーカープロセスを分けることを推奨。
  - 実際の重い処理は同期的にやらず、ジョブキュー(Celery+Redis等)に積むのが望ましい。
    ここでは最小構成として BackgroundTasks で疑似的な非同期処理にしている。
  - ファイルストレージはローカルディスクを想定(本番ではS3等に差し替え)。
"""

import os
import uuid
import shutil
from pathlib import Path
from typing import Optional, Literal

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ============================================================
# 設定
# ============================================================

BASE_DIR = Path(__file__).parent
STORAGE_DIR = BASE_DIR / "storage"
VOICE_PROFILES_DIR = STORAGE_DIR / "voice_profiles"
DRAFT_AUDIO_DIR = STORAGE_DIR / "draft_audio"
FINAL_AUDIO_DIR = STORAGE_DIR / "final_audio"

for d in [VOICE_PROFILES_DIR, DRAFT_AUDIO_DIR, FINAL_AUDIO_DIR]:
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
    final_status: Literal["idle", "generating", "done", "failed"]
    final_audio_url: Optional[str] = None
    error: Optional[str] = None


class ApplyVoiceRequest(BaseModel):
    voice_profile_id: str


# ============================================================
# Step 1: Kokoro による素のTTS(読み上げ生成)
# ============================================================

def run_kokoro_tts(text: str, output_path: Path) -> None:
    """
    テキストを声紋非依存の既定ボイスで読み上げ、output_pathにWAVを保存する。

    実際の実装イメージ(kokoro-onnxパッケージを使う場合):

        from kokoro_onnx import Kokoro
        import soundfile as sf

        kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
        samples, sample_rate = kokoro.create(
            text,
            voice="jf_alpha",   # 日本語の既定ボイス。実際のボイスIDはモデルに依存
            speed=1.0,
            lang="ja",
        )
        sf.write(str(output_path), samples, sample_rate)

    長文の場合は文単位に分割して生成・結合する処理をここに追加する。
    """
    raise NotImplementedError(
        "Kokoroモデルがロードされていません。"
        "kokoro-onnxのセットアップ(モデルファイルの配置)後、"
        "上記コメント内の実装に差し替えてください。"
    )


def process_draft_generation(chapter_id: str):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        return
    try:
        output_path = DRAFT_AUDIO_DIR / f"{chapter_id}.wav"
        run_kokoro_tts(chapter["body"], output_path)
        chapter["draft_status"] = "done"
        chapter["draft_audio_url"] = f"/files/draft_audio/{output_path.name}"
        chapter["draft_source_body"] = chapter["body"]
        # 本文を元に作り直した下書きなので、古い最終音声は無効化する
        chapter["final_status"] = "idle"
        chapter["final_audio_url"] = None
    except Exception as e:
        chapter["draft_status"] = "failed"
        chapter["error"] = str(e)


# ============================================================
# Step 2: KokoClone(Kanade)による声質変換(声で仕上げる)
# ============================================================

def run_voice_conversion(source_audio_path: Path, reference_audio_path: Path, output_path: Path) -> None:
    """
    下書き音声(source)を、声紋の参照音声(reference)の声質に変換し、
    output_pathに保存する。

    実際の実装イメージ(KokoCloneのAudio→Cloneモードを使う場合):

        import soundfile as sf
        from kanade_tokenizer import load_audio
        from core.cloner import KokoClone
        from core.chunked_convert import chunked_voice_conversion

        cloner = KokoClone()

        source_wav = load_audio(str(source_audio_path), sample_rate=cloner.sample_rate).to(cloner.device)
        ref_wav = load_audio(str(reference_audio_path), sample_rate=cloner.sample_rate).to(cloner.device)

        converted = chunked_voice_conversion(
            kanade=cloner.kanade,
            vocoder_model=cloner.vocoder,
            source_wav=source_wav,
            ref_wav=ref_wav,
            sample_rate=cloner.sample_rate,
        )
        sf.write(str(output_path), converted.numpy(), cloner.sample_rate)

    長尺の下書き音声でもchunked_voice_conversionがVRAM対応の自動チャンク分割を
    行うため、メモリ不足を気にせずそのまま渡せる。
    """
    raise NotImplementedError(
        "KokoClone(Kanade)モデルがロードされていません。"
        "kokocloneリポジトリのセットアップ後、"
        "上記コメント内の実装に差し替えてください。"
    )


def process_voice_application(chapter_id: str, voice_profile_id: str):
    chapter = chapters_db.get(chapter_id)
    profile = voice_profiles_db.get(voice_profile_id)
    if not chapter or not profile:
        return
    try:
        source_path = DRAFT_AUDIO_DIR / f"{chapter_id}.wav"
        reference_path = Path(profile["audio_path"])
        output_path = FINAL_AUDIO_DIR / f"{chapter_id}_{voice_profile_id}.wav"

        run_voice_conversion(source_path, reference_path, output_path)

        chapter["final_status"] = "done"
        chapter["final_audio_url"] = f"/files/final_audio/{output_path.name}"
        chapter["voice_profile_id"] = voice_profile_id
    except Exception as e:
        chapter["final_status"] = "failed"
        chapter["error"] = str(e)


# ============================================================
# 声紋API
# ============================================================

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

    # 本来はここで前処理(ノイズ除去・正規化・品質チェック)を行う
    quality_note = "前処理は未実装です。アップロードした音声をそのまま参照音声として使用します。"

    profile = {
        "id": profile_id,
        "label": label,
        "era_tag": era_tag,
        "source_type": source_type,
        "audio_path": str(saved_path),
        "audio_url": f"/files/voice_profiles/{saved_path.name}",
        "duration_sec": None,
        "quality_note": quality_note,
    }
    voice_profiles_db[profile_id] = profile
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
        "draft_source_body": None,
        "final_status": "idle",
        "final_audio_url": None,
        "error": None,
    }
    chapters_db[chapter_id] = chapter
    return ChapterOut(**chapter)


@app.get("/api/chapters", response_model=list[ChapterOut])
async def list_chapters():
    return [ChapterOut(**c) for c in chapters_db.values()]


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
    return ChapterOut(**chapter)


@app.delete("/api/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str):
    if chapter_id not in chapters_db:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    del chapters_db[chapter_id]
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
    background_tasks.add_task(process_draft_generation, chapter_id)
    return {"accepted": True}


@app.post("/api/chapters/{chapter_id}/apply-voice", status_code=202)
async def apply_voice(chapter_id: str, payload: ApplyVoiceRequest, background_tasks: BackgroundTasks):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    if chapter["draft_status"] != "done":
        raise HTTPException(status_code=400, detail="先に読み上げ生成(Step1)を完了してください")
    if payload.voice_profile_id not in voice_profiles_db:
        raise HTTPException(status_code=404, detail="指定された声紋が見つかりません")

    chapter["final_status"] = "generating"
    chapter["error"] = None
    background_tasks.add_task(process_voice_application, chapter_id, payload.voice_profile_id)
    return {"accepted": True}


@app.get("/api/chapters/{chapter_id}/status", response_model=ChapterOut)
async def get_chapter_status(chapter_id: str):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    return ChapterOut(**chapter)


@app.get("/")
async def root():
    return {"status": "ok", "service": "voice-narration-backend"}
