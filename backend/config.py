"""
パス・環境変数など、アプリ全体で共有する設定値。
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger("voice-narration")

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

for _d in [VOICE_PROFILES_DIR, DRAFT_AUDIO_DIR, FINAL_AUDIO_DIR, MODELS_DIR, PRIVATE_DRAFT_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

# サーバー再起動で登録内容(声紋・章)が消えないよう、変更のたびにJSONへ保存し起動時に読み戻す
STATE_PATH = STORAGE_DIR / "state.json"

# ビルド済みフロントエンド(frontend/dist)。存在すれば http://localhost:8000/app/ で配信する。
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

# Irodori-TTS(ワンショット生成、経路B既定方式)
IRODORI_DIR = Path(os.environ.get("IRODORI_DIR", str(Path.home() / "irodori-tts")))
IRODORI_CHECKPOINT = os.environ.get("IRODORI_CHECKPOINT", "Aratako/Irodori-TTS-500M-v3")


def final_engine() -> str:
    """最終音声の生成方式。irodori(既定)=テキストから直接生成 / kokoclone=下書きを声質変換"""
    return os.environ.get("FINAL_ENGINE", "irodori")
