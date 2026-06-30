# 声の記憶帳 - プロトタイプ接続手順

フロントエンド(voice-narration-prototype.jsx)とバックエンド(backend/main.py)を
実際に繋いで動かすための手順です。

## 構成

```
voice-narration-prototype.jsx   フロントエンド(React、Claude.aiのartifactとしてそのまま開ける)
backend/main.py                  バックエンド(FastAPI)
```

## 1. バックエンドのセットアップ

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windowsは venv\Scripts\activate

pip install fastapi uvicorn python-multipart
```

この時点ではTTS/声質変換のモデルが未接続なので、API自体は起動して
声紋登録・章のCRUDまでは動きますが、生成(/generate-draft, /apply-voice)を
呼ぶと NotImplementedError が返ります。これは意図的な状態で、
main.py内のコメントで示した実装に差し替えると動くようになります。

### Step 1 (読み上げ生成) を動かす場合

```bash
pip install kokoro-onnx soundfile
```

`run_kokoro_tts` 関数のコメント内コードを参考に実装してください。
モデルファイル(kokoro-v1.0.onnx, voices-v1.0.bin)は別途
Hugging Faceなどから取得し配置する必要があります。

### Step 2 (声で仕上げる) を動かす場合

```bash
git clone https://github.com/Ashish-Patnaik/kokoclone.git
cd kokoclone
pip install -r requirements.txt
# GPU環境なら: pip install kokoro-onnx[gpu]
```

`run_voice_conversion` 関数のコメント内コードを参考に実装してください。
モデルの重みは初回実行時にHugging Faceから自動ダウンロードされます。

### サーバー起動

```bash
uvicorn main:app --reload --port 8000
```

`http://localhost:8000` でAPIが立ち上がります。
`http://localhost:8000/docs` でSwagger UIから手動テストもできます。

## 2. フロントエンドの接続

`voice-narration-prototype.jsx` 内の `API_BASE` 定数が
デフォルトで `http://localhost:8000` を指しています。

別ホスト・別ポートで動かす場合は、ビルド時に環境変数
`REACT_APP_API_BASE` を設定するか、ファイル冒頭の `API_BASE` を直接書き換えてください。

## 3. 動作確認の流れ

1. バックエンドを起動する
2. フロントエンドを開く(接続できない場合は画面上部に赤いエラーバナーが出ます)
3. 「新規録音」または「過去の音声を追加」で声紋を登録する
4. 章を追加し、本文を入力して「読み上げを生成」を押す(Step1)
5. Step1完了後、声紋を選んで「この声で仕上げる」を押す(Step2)
6. 生成中はフロントが1.5秒おきにステータスをポーリングし、
   完了次第「完成」表示に切り替わります

## 既知の未実装・要検討事項

- 前処理(ノイズ除去・正規化)は `create_voice_profile` 内で未実装。
  `quality_note` は固定文言を返すのみ。
- 長文の章をStep1で生成する際の文単位分割・結合処理は未実装。
- 認証・ユーザー管理は未実装(個人利用前提の最小構成)。
- ジョブキュー(Celery等)は未導入。BackgroundTasksによる簡易非同期のみ。
  同時に複数の生成リクエストが来る運用では、Redis等を使ったキューに
  差し替えることを推奨します。
- ストレージはローカルディスク。本番ではS3等のオブジェクトストレージに
  差し替えることを推奨します。
