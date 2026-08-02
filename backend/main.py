"""
声の記憶帳 - バックエンドAPIサーバー

設計:
  Step 1 (読み上げ生成): 下書き音声を2通りの方法で用意できる
    - TTS合成: テキスト → AivisSpeech/Kokoro(固定ボイス) → 下書き音声
    - 本人録音: 本人が現在の声で読み上げた録音をそのままアップロード → 下書き音声
    どちらの場合も、下書き音声は声紋非依存(まだ本人の過去の声にはなっていない)。
  Step 2 (声で仕上げる): 下書き音声 + 声紋(参照音声) → KokoClone/Kanade(声質変換) → 最終音声
    (既定ではIrodori-TTSによるワンショット生成。voice_conversion.pyを参照)

モジュール構成:
  config.py           パス・環境変数などの設定値
  state.py             インメモリDB + state.jsonへの永続化
  models.py             Pydanticスキーマ
  audio_utils.py         音声形式変換・前処理・文分割
  tts_engines.py          Step1: TTS合成(AivisSpeech / Kokoro)
  voice_conversion.py      Step2: 声質変換(KokoClone) / Irodori-TTSワンショット生成
  jobs.py               バックグラウンドジョブの実行と状態反映
  main.py (このファイル)   FastAPIアプリ本体・ルート定義

実行方法:
  pip install -r requirements.txt
  python setup_models.py           (初回のみ: Kokoro使用時のみモデルファイルをダウンロード)
  git clone https://github.com/Ashish-Patnaik/kokoclone.git  (Step2用)
  cd kokoclone && pip install -r requirements.txt && cd ..
  uvicorn main:app --reload --port 8000
"""

import os
import uuid
import shutil
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from audio_utils import ensure_readable_wav, listening_entry, preprocess_voice_profile_audio
from config import (
    COMPARE_DIR,
    FINAL_AUDIO_DIR,
    FRONTEND_DIST,
    PRIVATE_DRAFT_DIR,
    STORAGE_DIR,
    VOICE_PROFILES_DIR,
    final_engine,
)
from jobs import process_draft_generation, process_voice_application
from models import (
    ApplyVoiceRequest,
    ChapterCreate,
    ChapterOut,
    ChapterUpdate,
    VoiceProfileOut,
    chapter_out,
)
from state import chapters_db, save_state, voice_profiles_db

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

    saved_path = ensure_readable_wav(saved_path)
    duration_sec, quality_note = preprocess_voice_profile_audio(saved_path)

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
    save_state()
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
    save_state()
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
    save_state()
    return chapter_out(chapter)


@app.get("/api/chapters", response_model=list[ChapterOut])
async def list_chapters():
    return [chapter_out(c) for c in chapters_db.values()]


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
    save_state()
    return chapter_out(chapter)


@app.delete("/api/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str):
    if chapter_id not in chapters_db:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    del chapters_db[chapter_id]
    save_state()
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
    save_state()
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

    output_path = ensure_readable_wav(output_path)

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
    save_state()
    return chapter_out(chapter)


@app.post("/api/chapters/{chapter_id}/apply-voice", status_code=202)
async def apply_voice(chapter_id: str, payload: ApplyVoiceRequest, background_tasks: BackgroundTasks):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    # Irodori直接生成モードでは下書き不要(本文テキストから直接生成する)。
    # 本人録音がある場合は従来どおり声質変換なので下書き必須
    irodori_direct = final_engine() == "irodori" and chapter.get("draft_source") != "recording"
    if irodori_direct:
        if not chapter["body"].strip():
            raise HTTPException(status_code=400, detail="本文が空です")
    elif chapter["draft_status"] != "done":
        raise HTTPException(status_code=400, detail="先に読み上げ生成(Step1)を完了してください")
    if payload.voice_profile_id not in voice_profiles_db:
        raise HTTPException(status_code=404, detail="指定された声紋が見つかりません")

    chapter["final_status"] = "generating"
    chapter["error"] = None
    save_state()
    background_tasks.add_task(process_voice_application, chapter_id, payload.voice_profile_id)
    return {"accepted": True}


@app.get("/api/chapters/{chapter_id}/status", response_model=ChapterOut)
async def get_chapter_status(chapter_id: str):
    chapter = chapters_db.get(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章が見つかりません")
    return chapter_out(chapter)


# ============================================================
# 試聴室API
# ============================================================

@app.get("/api/listening")
async def list_listening_audio():
    """試聴室(フロントの試聴画面)用に、配信してよい生成音声の一覧を返す。

    対象は聴き比べ音声(storage/compare)と変換済みの章音声(storage/final_audio)のみ。
    本人録音の下書きはstorage_private配下にあり、この一覧にも/files配信にも含まれない。
    """
    compare = [
        listening_entry(f, "/files/compare")
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
            final.append(listening_entry(f, "/files/final_audio", label))
    return {"compare": compare, "final": final}


@app.get("/")
async def root():
    return {"status": "ok", "service": "voice-narration-backend", "final_engine": final_engine()}


# ビルド済みフロントエンド(frontend/dist)があれば http://localhost:8000/app/ で配信する。
# これで常駐バックエンドだけ動いていれば、npm run dev なしでUIにアクセスできる。
# 反映するには frontend で `npm run build` が必要(vite.config.jsのbaseは相対パス)。
if FRONTEND_DIST.is_dir():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
