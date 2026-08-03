@echo off
rem テスト環境(開発サーバー)起動バッチ
rem バックエンド(uvicorn --reload)とフロントエンド(vite dev, ホットリロード)を
rem それぞれ別のcmd窓で起動し、vite開発用URLをブラウザで開く。
rem start-app.bat(本番ビルドdist配信)とは別物。

cd /d "%~dp0..\backend"
start "VoiceCloning-Backend(dev)" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

cd /d "%~dp0..\frontend"
start "VoiceCloning-Frontend(dev)" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul
start "" http://localhost:5173/
