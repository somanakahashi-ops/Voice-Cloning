@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0voice-cloning-backend.ps1"
timeout /t 8 /nobreak >nul
start "" http://localhost:8000/app/
