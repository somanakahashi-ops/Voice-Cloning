"""
Step 2: 声で仕上げる(最終音声の生成)。

2つの方式がある(config.final_engine()で選択):
  "irodori" (既定) - Irodori-TTSでテキスト+声紋参照音声から直接生成(ワンショット)。
                     本人録音の下書きがある場合はこちらは使わず、常にkokoclone側を使う。
  "kokoclone"        - KokoClone(Kanade)で下書き音声を声質変換(audio-to-audio)。
                     本人録音の下書き(経路A)は、この方式でのみ声質変換できる。
"""

import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

from audio_utils import split_sentences
from config import FINAL_AUDIO_DIR, IRODORI_CHECKPOINT, IRODORI_DIR, KOKOCLONE_DIR, logger

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
    sentences = split_sentences(text)
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
