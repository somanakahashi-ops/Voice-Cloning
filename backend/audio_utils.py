"""
音声ファイル関連のユーティリティ(形式変換・前処理・文分割)。
"""

import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import HTTPException


def split_sentences(text: str) -> list[str]:
    """日本語テキストを文単位に分割する。"""
    sentences = re.split(r'(?<=[。！？\!\?\.\n])', text)
    return [s.strip() for s in sentences if s.strip()]


def ensure_readable_wav(path: Path) -> Path:
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


def preprocess_voice_profile_audio(path: Path) -> tuple[Optional[float], str]:
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


def listening_entry(path: Path, url_prefix: str, label: Optional[str] = None) -> dict:
    try:
        info = sf.info(str(path))
        seconds = round(info.frames / info.samplerate, 1)
    except Exception:
        seconds = None
    return {"name": path.name, "label": label, "url": f"{url_prefix}/{path.name}", "seconds": seconds}
