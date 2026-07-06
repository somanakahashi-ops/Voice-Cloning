# 声の記憶帳 - バックエンドセットアップ

## 前提条件

- Python 3.10+
- GPU環境推奨（Step2の声質変換はGPU前提。Step1のTTSはCPUでも動作する）

## Step1(下書き音声)の2つの用意方法

章のナレーション下書きは、どちらの方法で用意してもStep2(声質変換)にそのまま使えます。

1. **本人録音**（推奨・最も自然）— 本人が現在の声で読み上げた録音をそのままアップロード。
   TTSを経由しないため、ナレーションの自然さは実際の発話そのもの。
2. **TTS合成** — 本人が読めない章向け。`TTS_ENGINE`環境変数でエンジンを選択:
   - `aivisspeech`（既定）— 日本語特化・CPU動作可・LGPL-3.0で商用利用可
   - `kokoro` — 多言語対応・Apache 2.0・Pythonパッケージのみで完結

## セットアップ

### 1. Python依存パッケージのインストール

```bash
cd backend
pip install -r requirements.txt
```

### 2-A. AivisSpeech Engineのセットアップ（TTS_ENGINE=aivisspeech、既定）

1. https://aivis-project.com/ からAivisSpeech Engineをダウンロードして起動
   （既定で `http://localhost:10101` で待ち受ける）
2. 音声モデルは **CC0 または ACML(商用利用可)** のものを選ぶこと。
   **ACML-NC(非商用限定)は選ばないこと**（本プロジェクトは商用利用可能な構成を維持する方針のため）
3. 使う話者IDを `AIVISSPEECH_SPEAKER_ID` 環境変数で指定（未設定時は既定値を使用）

### 2-B. Kokoroモデルファイルのダウンロード（TTS_ENGINE=kokoro を使う場合のみ）

```bash
python setup_models.py
```

`models/` ディレクトリに以下がダウンロードされます:
- `kokoro-v1.0.onnx` （TTSモデル本体）
- `voices-v1.0.bin` （声スタイル埋め込み）

### 3. KokoCloneのセットアップ（Step2用）

```bash
git clone https://github.com/Ashish-Patnaik/kokoclone.git
cd kokoclone
pip install -r requirements.txt
cd ..
```

GPU環境の場合:
```bash
pip install kokoro-onnx[gpu]
```

Kanadeモデルの重みは初回実行時にHugging Faceから自動ダウンロードされます。

### 4. サーバー起動

```bash
uvicorn main:app --reload --port 8000
```

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

## 環境変数（任意）

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `TTS_ENGINE` | `aivisspeech` | Step1のTTSエンジン（`aivisspeech` または `kokoro`） |
| `AIVISSPEECH_BASE_URL` | `http://localhost:10101` | AivisSpeech EngineのURL |
| `AIVISSPEECH_SPEAKER_ID` | (既定話者) | AivisSpeechの話者ID（商用利用可能なモデルを選ぶこと） |
| `KOKORO_VOICE` | `jf_alpha` | Kokoro使用時の日本語ボイスID |
| `KOKORO_SPEED` | `1.0` | Kokoro使用時の読み上げ速度（0.5〜2.0） |
| `KOKORO_LANG` | `ja` | Kokoro使用時の言語コード |

## ディレクトリ構成

```
backend/
├── main.py              APIサーバー本体
├── setup_models.py      Kokoroモデルダウンロードスクリプト(kokoro使用時のみ)
├── requirements.txt     Python依存パッケージ
├── README.md            このファイル
├── models/              Kokoroモデルファイル（gitignore対象、kokoro使用時のみ）
├── kokoclone/           KokoCloneリポジトリ（git clone で取得）
└── storage/             生成ファイル保存先（gitignore対象）
    ├── voice_profiles/  アップロードされた声紋音声
    ├── draft_audio/     Step1で用意した下書き音声(本人録音 or TTS生成)
    └── final_audio/     Step2で生成した最終音声
```

## 動作確認の流れ

1. サーバーを起動
2. フロントエンドを開く（接続できない場合は画面上部に赤いエラーバナー）
3. 声紋を登録（録音 or アップロード）
4. 章を追加し、本文を入力。下書きは以下のどちらかで用意:
   - 本人が読み上げた録音をアップロード
   - 「読み上げを生成」でTTS合成（Step1）
5. 下書き完成後、声紋を選んで「この声で仕上げる」（Step2）
6. フロントが1.5秒おきにポーリングし、完了次第「完成」表示

## ライセンス情報

| コンポーネント | ライセンス | 商用利用 |
|---------------|-----------|---------|
| KokoClone | Apache 2.0 | 可 |
| Kanade Tokenizer | MIT | 可 |
| AivisSpeech Engine | LGPL-3.0 | 可（音声モデルは個別確認。ACML-NCは避けること） |
| Kokoro-ONNX | Apache 2.0 | 可 |
