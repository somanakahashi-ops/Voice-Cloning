# 声の記憶帳 - バックエンドセットアップ

## 前提条件

- Python 3.10+
- GPU環境推奨（Step2の声質変換はGPU前提。Step1のTTSはCPUでも動作するが遅い）

## セットアップ

### 1. Python依存パッケージのインストール

```bash
cd backend
pip install -r requirements.txt
```

### 2. Kokoroモデルファイルのダウンロード（Step1用）

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
| `KOKORO_VOICE` | `jf_alpha` | Step1で使う日本語ボイスID |
| `KOKORO_SPEED` | `1.0` | 読み上げ速度（0.5〜2.0） |
| `KOKORO_LANG` | `ja` | 言語コード |

## ディレクトリ構成

```
backend/
├── main.py              APIサーバー本体
├── setup_models.py      モデルダウンロードスクリプト
├── requirements.txt     Python依存パッケージ
├── README.md            このファイル
├── models/              Kokoroモデルファイル（gitignore対象）
│   ├── kokoro-v1.0.onnx
│   └── voices-v1.0.bin
├── kokoclone/           KokoCloneリポジトリ（git clone で取得）
└── storage/             生成ファイル保存先（gitignore対象）
    ├── voice_profiles/  アップロードされた声紋音声
    ├── draft_audio/     Step1で生成した下書き音声
    └── final_audio/     Step2で生成した最終音声
```

## 動作確認の流れ

1. サーバーを起動
2. フロントエンドを開く（接続できない場合は画面上部に赤いエラーバナー）
3. 声紋を登録（録音 or アップロード）
4. 章を追加し、本文を入力して「読み上げを生成」（Step1）
5. Step1完了後、声紋を選んで「この声で仕上げる」（Step2）
6. フロントが1.5秒おきにポーリングし、完了次第「完成」表示

## ライセンス情報

| コンポーネント | ライセンス | 商用利用 |
|---------------|-----------|---------|
| KokoClone | Apache 2.0 | 可 |
| Kokoro-ONNX | Apache 2.0 | 可 |
| Kanade Tokenizer | MIT | 可 |
