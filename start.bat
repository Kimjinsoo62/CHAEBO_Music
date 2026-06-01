@echo off
REM Kill any existing process on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Add FFmpeg to PATH
set PATH=%~dp0ffmpeg\bin;%PATH%

REM Suppress TensorFlow warnings
set TF_CPP_MIN_LOG_LEVEL=3
set TF_ENABLE_ONEDNN_OPTS=0

cd /d %~dp0backend
call venv\Scripts\activate
start /min python run_app.py
