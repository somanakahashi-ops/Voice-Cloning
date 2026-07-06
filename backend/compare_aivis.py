"""経路B聴き比べ用: AivisSpeech(TTS下書き) → KokoClone(声紋A変換) の2段階生成。"""
import io
import sys
import numpy as np
import requests
import soundfile as sf
from pathlib import Path

sys.path.insert(0, "kokoclone")

TEXT_SENTENCES = [
    "予定日よりもずいぶん遅れて生まれたそうなんです。",
    "母のお腹がはち切れそうになってもなかなか出てこなくて、家族みんながヤキモキしながら待っていたと聞きました。",
]
SPEAKER_ID = 888753760
BASE_URL = "http://127.0.0.1:10101"
REF_WAV = "storage/voice_profiles/08806a0c-92c6-4f0f-9432-1da443dc4818.wav"
OUT_DIR = Path("storage/compare")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# --- Step B-1: AivisSpeechで下書きTTS ---
parts, sr = [], None
for s in TEXT_SENTENCES:
    q = requests.post(f"{BASE_URL}/audio_query", params={"text": s, "speaker": SPEAKER_ID}, timeout=60)
    q.raise_for_status()
    syn = requests.post(f"{BASE_URL}/synthesis", params={"speaker": SPEAKER_ID}, json=q.json(), timeout=180)
    syn.raise_for_status()
    d, sr = sf.read(io.BytesIO(syn.content))
    parts.append(d.astype(np.float32))
    parts.append(np.zeros(int(sr * 0.3), dtype=np.float32))

draft_path = OUT_DIR / "aivis_draft.wav"
sf.write(str(draft_path), np.concatenate(parts), sr)
print(f"draft OK: {draft_path}")

# --- Step B-2: KokoCloneで声紋Aに変換 ---
from core.cloner import KokoClone
cloner = KokoClone()
out_path = OUT_DIR / "aivis_version.wav"
cloner.convert(source_audio=str(draft_path), reference_audio=REF_WAV, output_path=str(out_path))
print(f"final OK: {out_path}")
