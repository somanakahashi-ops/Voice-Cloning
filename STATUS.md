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
- [x] **試聴室画面**(2026-07-14) — フロント上部のタブ「記憶帳|試聴室」で切替。`src/ListeningRoom.jsx`が`GET /api/listening`(main.pyに追加)から一覧を取得し、聴き比べ音声(storage/compare)と変換済み章音声(storage/final_audio)をブラウザ再生できる。本人録音の下書き(storage_private)は一覧にも配信にも含まれない(404確認済み)
- [x] **登録データの永続化**(2026-07-14) — 声紋・章を変更のたびに`backend/storage/state.json`へ保存し起動時に復元。**サーバー再起動で登録が消える問題は解消**。再起動をまたいだ復元をE2E確認済み。中断された生成はfailed扱いで復元
- [x] **スマホ録音(m4a/webm等)の自動変換**(2026-07-14) — 声紋登録・本人録音アップロードの両方で、soundfileが読めない形式はffmpegで24kHzモノラルWAVに自動変換(`_ensure_readable_wav()`)。実m4aでE2E確認済み。手動変換は不要になった

## 公開(2026-07-07)

- リポジトリを公開に変更: https://github.com/somanakahashi-ops/Voice-Cloning
- フロントエンドUIをGitHub Pagesで公開: **https://somanakahashi-ops.github.io/Voice-Cloning/**
  - pushのたびにGitHub Actionsで自動ビルド&デプロイされる(`.github/workflows/deploy-pages.yml`)
  - バックエンドは含まれないため、公開ページでは生成機能は動かない。実動はローカル(常駐バックエンド+`/app`配信)
- **公開ページでも試聴室は鳴る**(2026-07-14): 選別済み音声6本(聴き比べ4+変換結果2、計約1.7MB)をMP3化して`frontend/public/listening/`に同梱(.gitignoreに例外追加)。試聴室はAPI接続失敗時に`listening/manifest.json`へフォールバックし「公開デモ版」バナーを表示。github.ioでは試聴室タブが初期表示
  - **含めていないもの**: 本人録音(方針どおり非公開)、変換前のAivisSpeech下書き(モデル利用規約が未確認のため保留)
- **上司向けデモの手順書**: `DEMO.md`(常設=公開試聴室、ライブ=上司の声を声紋登録して章を読ませる流れ、事前準備・保険つき)

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
- [x] **経路Bの方式決定(2026-07-14、ユーザー判断)**: **Irodoriワンショットを採用**。聴き比べ材料は`backend/storage/compare/`に6ファイル(短尺/フル×draft/aivis/irodori)
- [x] **Irodori直接生成をアプリに組み込み(2026-07-15)**: 環境変数`FINAL_ENGINE`(既定`irodori`)で最終音声の生成方式を切替
  - `irodori`(既定): Step2「この声で仕上げる」が**本文テキスト+声紋から直接生成**(`run_irodori_tts()`、uv経由でinfer.pyをサブプロセス実行)。**下書き不要**(UIもStep1が「任意」表示になり、テキストだけでStep2に進める)。ただし**本人録音の下書きがある章は従来どおりKokoClone声質変換**(経路Aは不変)
  - `kokoclone`: 従来動作(下書き必須→声質変換)
  - 長文はOOM対策で**2文ずつ分割生成して結合**(実測に基づく)。重い生成は`_heavy_job_lock`で直列化(TTS/変換/Irodori共通)
  - E2E確認済み(2026-07-15): 下書きなしで2文の章+声紋A→14.4秒/48kHzの最終音声が生成された(CPU約4分)
  - フロントはサーバーの`GET /`の`final_engine`を見て挙動を切替(エンジン設定はサーバー側だけで完結)

## 未着手・保留

- [x] **AivisSpeechモデルのライセンス確認** — 確認済み(2026-07-15)。使用中の話者「まお」を含むモデル(`a59cb814-*.aivmx`、オズチャット/Trippy制作)は**ACML 1.0(無印)=営利利用可**(モデル内蔵のライセンス全文で確認。クレジット表記任意、アプリ組み込みも開発元がライセンス遵守すれば可)。懸念していたACML-NC(非商用)ではなかった。もう1つの導入済みモデル「コハク」(`22e8ed77-*`)もACML 1.0
- [ ] **実GPU環境での検証** — CPUでの疎通は確認済み(上記)。長い章や大量生成でCPUが遅すぎる場合のみ、クラウドGPU(RunPod、Lambda Labs等)を検討すればよい(必須ではなくなった)。
- [x] **Kanade Tokenizerのライセンス個別確認** — 確認済み(2026-07-06)。コード: MIT(パッケージMETADATAで確認)、モデル重みkanade-12.5hz: MIT(HFモデルカードで確認)、推論時に自動DLされるVocosボコーダー: MIT(HFで確認)。学習データはLibriTTS(パブリックドメインのLibriVox由来)。「商用利用可能なライセンスのみ」の方針を満たすことを裏付け済み

## ローカル環境(このWindowsマシン: C:\Users\porup)

- Python: デフォルトは3.14だが、spaCy系依存(blis)のビルドが通らないため**Python 3.12を別途インストールし専用venvを使用**
  - venv: `backend\.venv`(Python 3.12.10)
  - `backend\requirements.txt` と `backend\kokoclone\requirements.txt` の両方をこのvenvにインストール済み
- PyTorch: `2.12.1+cpu`(CPU版。このマシンにNVIDIA GPUがないため)
- Kokoroモデルファイル: `backend\models\` にダウンロード済み(kokoro使用時の代替エンジン用)
- KokoClone: `backend\kokoclone\` にclone済み

## バックエンドの常駐化(2026-07-14)

- **ログオン時にAPIサーバーが自動起動**する(Windowsタスクスケジューラ: `VoiceCloningBackend`)
  - スクリプト: `C:\Users\porup\scripts\voice-cloning-backend.ps1`(監視ループ。uvicornが落ちたら15秒後に自動再起動、二重起動はポート8000チェックで防止)— 動作検証済み(kill→自動復活を確認)
  - ログ: `C:\Users\porup\scripts\voice-cloning-backend-log.txt`(イベント)、`-out.log`/`-err.log`(uvicorn出力、5MB超で自動クリア)
  - 停止したいとき: `schtasks /End /TN VoiceCloningBackend` の後、残ったpython.exeをタスクマネージャ等で終了
- **ビルド済みフロントを `/app` で配信**: バックエンドさえ動いていれば **http://localhost:8000/app/** でUI(記憶帳+試聴室)にアクセスできる(`npm run dev`不要)
  - `frontend/dist`があるときだけマウントされる。**UIを変更したら `cd frontend && npm run build` で反映**
  - `vite.config.js`のbaseを相対パス(`./`)に変更済み — GitHub Pagesと`/app`配信で同じビルドが動く

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
