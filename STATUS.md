# 現在の作業状況

最終更新: 2026-07-06(このセッションでの作業内容)

このファイルは「今どこまで進んでいて、次に何をすればいいか」を後継セッション(別のClaude Codeセッション、claude.ai/codeセッション等)が把握するためのものです。設計の背景や方針は `handoff-instructions.txt` を参照してください。こちらは常に最新の実装状況・環境状況を反映するように更新してください。

## 実装状況(backend/main.py)

- [x] `run_kokoro_tts()` — 実装済み(Kokoro-ONNX)
- [x] `run_aivisspeech_tts()` — 実装済み(AivisSpeech Engine、既定のTTSエンジン)
- [x] `run_voice_conversion()` — 実装済み。`KokoClone.convert()`が内部で`chunked_voice_conversion`を使うため、長尺音声のVRAM対策も込み
- [x] 長文の文単位分割 — `_split_sentences()`で実装済み(TTS生成時に文ごとに分割し無音を挟んで結合)
- [x] 声紋登録時の軽量な前処理 — `_preprocess_voice_profile_audio()`で実装済み(DCオフセット除去・ピークレベル正規化のみ。方針により強いノイズ除去はしていない)
- [x] 本人録音アップロード(`POST /api/chapters/{id}/upload-draft`) — 実装済み(TTSを経由せず下書き音声として直接使う)
- [x] **Step1のE2E動作確認(CPU)** — 確認済み(2026-07-06)。`TTS_ENGINE=kokoro`で日本語短文→WAV生成が約10秒以内で成功
- [x] **Step2のE2E動作確認(CPU)** — 確認済み(2026-07-06)。声紋登録→声質変換が**モデルロード込みで約90秒**(8秒の音声、CPU)で成功。出力は24kHzの正常なWAV。**個人利用の短い章ならCPUでも実用範囲**の可能性が高い
- [x] **フロントエンドの実行環境** — `frontend/`にVite(React)プロジェクトを作成し、`voice-narration-prototype.tsx`を`src/VoiceNarrationApp.jsx`として組み込み済み。ビルド・表示確認済み。起動: `cd frontend && npm install && npm run dev`(API_BASEはlocalhost:8000がデフォルト)
- [x] **試聴室画面**(2026-07-14) — フロント上部のタブ「記憶帳|試聴室」で切替。`src/ListeningRoom.jsx`が`GET /api/listening`(main.pyに追加)から一覧を取得し、聴き比べ音声(storage/compare)と変換済み章音声(storage/final_audio)をブラウザ再生できる。本人録音の下書き(storage_private)は一覧にも配信にも含まれない(404確認済み)。バックエンド未起動時(GitHub Pages含む)は接続エラーバナー表示

## 公開(2026-07-07)

- リポジトリを公開に変更: https://github.com/somanakahashi-ops/Voice-Cloning
- フロントエンドUIをGitHub Pagesで公開: **https://somanakahashi-ops.github.io/Voice-Cloning/**
  - pushのたびにGitHub Actionsで自動ビルド&デプロイされる(`.github/workflows/deploy-pages.yml`)
  - バックエンドは含まれないため、公開ページでは生成機能は動かない(接続エラーバナーが出る見た目のデモ)。実動はローカルで`uvicorn`+`npm run dev`

## 実データでの検証(2026-07-06)

- **第一章「誕生」**: 本人の読み上げ録音(25.8秒、m4a)を下書きとして登録し、Step2で声質変換まで完走
  - 下書き: `新規録音 216.m4a` → ffmpegで24kHz WAVに変換(ffmpegはwingetでインストール済み。今後m4a/スマホ録音はそのまま使える)
  - 声紋: 話者Aの母音発声60ファイル(各約1秒、リポジトリ外のローカル研究サンプル)を連結した75秒を使用
  - 変換時間: 25.8秒の音声で約1分(CPU、モデルロード済みの状態)
  - 出力: `backend/storage/final_audio/da0f33f0-*.wav`(25.8秒、24kHz、正常なWAV)
  - **品質の注意**: 声紋が孤立母音のみ(自然な会話ではない)ため、声質再現には本質的な限界がある。自然な連続発話10〜30秒の声紋で要再検証
- **2人目の声紋(話者B)でも同章を変換済み**(2026-07-06)。母音59ファイル連結102秒を声紋に使用、変換約2分(CPU)。出力: `backend/storage/final_audio/da0f33f0-*_fb48a0e0-*.wav`。同一下書きに対する声紋違いの聴き比べが可能になった(2段階構成の狙い通り)
- 生成音声・個人録音は.gitignoreで除外している(プライバシー保護。*.m4a/*.wav/*.mp3等)

## Irodori-TTS(経路B置き換え候補)の状況

- 提案の経緯は`handoff-instructions.txt`参照(別セッション2026-07-06更新): テキスト+声紋参照音声のワンショット生成で、経路BのAivisSpeech+KokoClone2段階を単体置き換えできる可能性
- [x] **モデル重みのライセンス確認** — 確認済み(2026-07-07)。`Aratako/Irodori-TTS-500M-v3`は**MIT・商用利用可**(HFモデルカードで確認)。利用規約として「本人の明示的同意のない声のクローン禁止」等の倫理条項あり — 本プロジェクトは本人・同意者の声のみを扱う設計のため適合
- [x] **経路Bの小規模聴き比べ音声を生成**(2026-07-07)。同一テキスト(第一章の冒頭2文)+同一声紋Aで2方式を生成:
  - `backend/storage/compare/aivis_version.wav` — AivisSpeech(話者まお)→KokoClone変換の2段階(12.2秒。下書きTTSは数秒、変換33.6秒+モデルロード)
  - `backend/storage/compare/irodori_version.wav` — Irodori-TTS-500M-v3ワンショット(14.1秒。CPU推論 約155秒)
  - 生成スクリプト: `backend/compare_aivis.py`(AivisSpeech側、`--full`でフルテキスト)、Irodori側は`C:\Users\porup\irodori-tts`でinfer.py直叩き
  - **教訓**: RAM15GBのマシンでKanade系プロセスを並行させるとMemoryErrorで落ちる。重い生成は直列実行すること
  - AivisSpeech Engine 1.2.0は`C:\Users\porup\aivisspeech-engine\Windows-x64\run.exe`に導入済み(port 10101)
- [x] **フルテキスト(第一章4文)版も生成**(2026-07-07):
  - AivisSpeech2段階: `backend/storage/compare/aivis_version_full.wav`(約30秒)— 完成
  - Irodori: フルテキスト一括生成は**2回連続で無言クラッシュ(exit 4)**。DACVAEコーデックのロード直後に落ちる(空きRAM約6GBでのロード/推論OOMと推定)。→ **回避策: 2文ずつ分割生成**。前半=既存`irodori_version.wav`(冒頭2文と同一)、後半2文=生成成功(CPU約219秒)
  - 前後半を0.3秒ギャップで結合し `backend/storage/compare/irodori_version_full.wav` を作成済み(48kHz、35.3秒)。**このマシンでIrodoriの長文を扱うには2文程度ずつの分割生成が必須**
- [x] **経路Bの方式決定(2026-07-14、ユーザー判断)**: **Irodoriワンショットを採用**。長文対応(分割生成の作り込み)は当面不要(「とりあえず全部ワンショットでいい」)。聴き比べ材料は`backend/storage/compare/`に6ファイル(短尺/フル×draft/aivis/irodori)
- [ ] **次の実装タスク: `TTS_ENGINE=irodori`**(経路Bの単体構成化)。Irodoriは`C:\Users\porup\irodori-tts`のuv環境でinfer.py実行(バックエンドとは別venv)。テキスト+声紋参照wavで直接最終音声が出るため、irodori時はStep2(KokoClone変換)をスキップする流れになる。重い生成の直列化(同時1件)に注意

## 未着手・保留

- [ ] **AivisSpeech Engine本体のセットアップ** — 外部アプリのため要手動対応。https://aivis-project.com/ からダウンロード・起動し(既定で`localhost:10101`)、**CC0またはACML(商用可)の音声モデル**を選ぶこと(ACML-NCは不可)。ユーザー側の対応待ち。
- [ ] **実GPU環境での検証** — CPUでの疎通は確認済み(上記)。長い章や大量生成でCPUが遅すぎる場合のみ、クラウドGPU(RunPod、Lambda Labs等)を検討すればよい(必須ではなくなった)。
- [x] **Kanade Tokenizerのライセンス個別確認** — 確認済み(2026-07-06)。コード: MIT(パッケージMETADATAで確認)、モデル重みkanade-12.5hz: MIT(HFモデルカードで確認)、推論時に自動DLされるVocosボコーダー: MIT(HFで確認)。学習データはLibriTTS(パブリックドメインのLibriVox由来)。「商用利用可能なライセンスのみ」の方針を満たすことを裏付け済み

## ローカル環境(このWindowsマシン: C:\Users\porup)

- Python: デフォルトは3.14だが、spaCy系依存(blis)のビルドが通らないため**Python 3.12を別途インストールし専用venvを使用**
  - venv: `backend\.venv`(Python 3.12.10)
  - `backend\requirements.txt` と `backend\kokoclone\requirements.txt` の両方をこのvenvにインストール済み
- PyTorch: `2.12.1+cpu`(CPU版。このマシンにNVIDIA GPUがないため)
- Kokoroモデルファイル: `backend\models\` にダウンロード済み(kokoro使用時の代替エンジン用)
- KokoClone: `backend\kokoclone\` にclone済み

## Git自動化

1. **平日18時までの自動sync**(Windowsタスクスケジューラ: `VoiceCloningAutoSync`)
   - スクリプト: `C:\Users\porup\scripts\voice-cloning-autosync.ps1`
   - 平日0:00〜24:00に1時間おきにチェック。18時以降・未同期・**作業ツリーがクリーンな場合のみ** pull→push
   - 未コミットの変更がある場合は何もしない(作業中のものを勝手にコミットしないため)
   - ログ: `C:\Users\porup\scripts\voice-cloning-autosync-log.txt`

2. **会話終了時の自動push**(Stopフック、`Voice-Cloning\.claude\settings.local.json`。gitignore対象でリポジトリには含まれない)
   - スクリプト: `C:\Users\porup\scripts\voice-cloning-stop-hook.sh`(bash)
   - 実行時のcwdが `C:\Users\porup\Voice-Cloning` 配下のときだけ動作。commit→pull→push
   - **注意**: cwdが `C:\Users\porup`(親ディレクトリ)を起点にしたセッションでは発火しない。Voice-Cloningフォルダを起点に `claude` を起動したセッションでのみ有効
   - ログ: `C:\Users\porup\scripts\voice-cloning-hook-log.txt`
   - このリポジトリ専用のgit identityをlocal設定済み(`Claude <noreply@anthropic.com>`)

## 既知のハマりどころ(このマシン固有)

- Windows PowerShell 5.1で、ネイティブコマンド(git等)の標準エラー出力を`2>&1`でマージすると、`$ErrorActionPreference = "Stop"`と組み合わさって例外扱いされる(git push/pullの正常時メッセージが誤ってエラー扱いになる)。→ ネイティブコマンドは`2>&1`せずに実行し、`$LASTEXITCODE`で判定すること
- 日本語を含む`.ps1`ファイルはBOM付きUTF-8で保存しないとWindows PowerShell 5.1でパースエラーになることがある
