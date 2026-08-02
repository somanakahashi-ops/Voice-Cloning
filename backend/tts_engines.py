"""
Step 1: TTS合成による下書き音声生成(読み上げ生成)。

TTS_ENGINE環境変数でエンジンを切り替え可能:
  "aivisspeech" (既定) - 日本語特化・CPU動作可・LGPL-3.0で商用利用可
                         事前にAivisSpeech Engineを別途起動しておくこと
  "kokoro"              - 多言語対応・Apache 2.0
"""

import io
import os
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

from audio_utils import split_sentences
from config import KOKORO_MODEL_PATH, KOKORO_VOICES_PATH, logger

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


def run_kokoro_tts(text: str, output_path: Path) -> None:
    kokoro = _get_kokoro()

    voice = os.environ.get("KOKORO_VOICE", "jf_alpha")
    speed = float(os.environ.get("KOKORO_SPEED", "1.0"))
    lang = os.environ.get("KOKORO_LANG", "ja")

    sentences = split_sentences(text)
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

    sentences = split_sentences(text)
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
