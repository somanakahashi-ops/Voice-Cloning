@echo off
chcp 65001 >nul
rem 声の記憶帳を起動する(フロントエンドを最新の状態にビルドしてから)。
rem 見た目やUIを変更したあと、ビルドし忘れて古い画面が表示される事故を防ぐため、
rem 毎回ここでビルドしてから起動する(通常1〜2秒で終わる)。

echo フロントエンドをビルド中...
cd /d "%~dp0..\frontend"
call npm run build
if errorlevel 1 (
    echo ビルドに失敗しました。一度 "cd frontend && npm install" を実行してから、もう一度お試しください。
    pause
    exit /b 1
)

echo バックエンドを起動中...
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0voice-cloning-backend.ps1"
timeout /t 8 /nobreak >nul

rem backend\certs\にHTTPS証明書があれば、httpsで開く(スマホ等LAN経由でのマイク利用に必要)。
rem 証明書の作り方: powershell -ExecutionPolicy Bypass -File scripts\generate-https-cert.ps1
if exist "%~dp0..\backend\certs\cert.pem" (
    start "" https://localhost:8000/app/
) else (
    start "" http://localhost:8000/app/
)
