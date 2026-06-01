@echo off
echo ==========================================
echo MelodyScribe Installation Script
echo ==========================================

REM Add FFmpeg to PATH
set PATH=%~dp0ffmpeg\bin;%PATH%

echo [1/2] Setting up Backend (Python 3.11)...
cd backend
if exist "venv" (
    echo Removing old virtual environment...
    rmdir /s /q venv
)
echo Creating virtual environment with Python 3.11...
py -3.11 -m venv venv
echo Activating virtual environment and installing dependencies...
call venv\Scripts\activate
python.exe -m pip install --upgrade pip
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Backend installation failed.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo [2/2] Setting up Frontend (Next.js)...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend installation failed.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo ==========================================
echo Installation Complete!
echo You can now run 'start.bat' to launch the app.
echo ==========================================
pause
