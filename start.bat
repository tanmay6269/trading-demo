@echo off
title Launching Groww Trading Terminal...
echo ===================================================
echo 🚀 Starting Groww Trading Terminal Platform
echo ===================================================

:: 1. Start Python Flask Backend in background window
echo [1/2] Starting Python Flask Backend on http://127.0.0.1:5000...
start "Groww Backend API" cmd /k "cd /d %~dp0backend && python app.py"

:: 2. Wait 3 seconds for backend initialization
timeout /t 3 /nobreak >nul

:: 3. Start React Frontend
echo [2/2] Starting React Web App on http://localhost:3000...
cd /d %~dp0frontend
npm start

pause
