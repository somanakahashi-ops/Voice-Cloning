"""
バックグラウンドジョブ(下書き生成・声質変換)の実行と、状態(state.py)への反映。
"""

import threading
from pathlib import Path

from config import DRAFT_AUDIO_DIR, FINAL_AUDIO_DIR, final_engine
from state import chapters_db, save_state, voice_profiles_db
from tts_engines import run_tts
from voice_conversion import run_irodori_tts, run_voice_conversion

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
    save_state()


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
            if final_engine() == "irodori" and chapter.get("draft_source") != "recording":
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
    save_state()
