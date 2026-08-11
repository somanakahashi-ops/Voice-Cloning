@echo off
chcp 65001 >nul
rem Wi-Fiを切り替えた後(会議室など、いつもと違うネットワークに繋いだとき)に
rem まとめて実行するバッチ。以下を一括で行う。
rem   1) 動いているバックエンドを停止
rem   2) 新しいWi-FiのLAN IPで証明書を作り直す(generate-https-cert.ps1)
rem   3) start-app.bat と同じ手順でビルド・起動・ブラウザを開く
rem
rem 使うタイミング: 新しいWi-Fiに繋いだ直後、このバッチを実行するだけでよい。

echo 既存のバックエンドを停止中...
rem 注意: 他に動いているpython.exeがあれば一緒に終了します
taskkill /F /IM python.exe >nul 2>&1

echo.
echo 新しいWi-FiのIPで証明書を作り直しています...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-https-cert.ps1"
if errorlevel 1 (
    echo 証明書の作成に失敗しました。
    pause
    exit /b 1
)

echo.
call "%~dp0start-app.bat"
