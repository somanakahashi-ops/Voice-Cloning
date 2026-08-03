@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\SPELLERS\01_開発\Voice-Cloning\scripts\voice-cloning-backend.ps1"
timeout /t 8 /nobreak >nul
start "" http://localhost:8000/app/
