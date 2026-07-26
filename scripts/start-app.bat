@echo off
schtasks /Run /TN VoiceCloningBackend
timeout /t 8 /nobreak >nul
start "" http://localhost:8000/app/
