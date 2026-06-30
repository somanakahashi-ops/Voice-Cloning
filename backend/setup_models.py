"""
Kokoroモデルファイルのダウンロードスクリプト。
初回セットアップ時に1回だけ実行する。

使い方:
  cd backend
  python setup_models.py
"""

import urllib.request
import sys
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "models"

FILES = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def download(name: str, url: str) -> None:
    dest = MODELS_DIR / name
    if dest.exists():
        print(f"  [スキップ] {name} は既にダウンロード済み")
        return

    print(f"  [ダウンロード中] {name} ...")
    urllib.request.urlretrieve(url, str(dest))
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"  [完了] {name} ({size_mb:.1f} MB)")


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"モデル保存先: {MODELS_DIR}")
    print()

    for name, url in FILES.items():
        try:
            download(name, url)
        except Exception as e:
            print(f"  [エラー] {name} のダウンロードに失敗: {e}", file=sys.stderr)
            sys.exit(1)

    print()
    print("セットアップ完了。")
    print("KokoClone(Step2)を使う場合は、別途以下を実行してください:")
    print("  git clone https://github.com/Ashish-Patnaik/kokoclone.git")
    print("  cd kokoclone && pip install -r requirements.txt")


if __name__ == "__main__":
    main()
