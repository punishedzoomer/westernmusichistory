@echo off
rem History of Western Music Revision App Launcher (Windows)
cd /d "%~dp0"

echo ==========================================================
echo  Starting History of Western Music Revision App (Urtext)
echo ==========================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Python is required to run the local server.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

start http://localhost:8765
python server.py 8765
pause
