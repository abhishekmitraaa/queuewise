@echo off
rem QueueWise one-click demo for Windows: sets up (first run only), then serves
rem the app at http://127.0.0.1:8000 from the local Python backend.
setlocal
cd /d "%~dp0"

if not exist backend\.venv\Scripts\python.exe (
  echo [QueueWise] Creating the Python virtual environment...
  python -m venv backend\.venv || goto :error
  backend\.venv\Scripts\python -m pip install -r backend\requirements.txt || goto :error
)

if not exist frontend\dist\index.html (
  echo [QueueWise] Building the frontend...
  pushd frontend
  call npm install || goto :error
  call npm run build || goto :error
  popd
)

echo [QueueWise] Starting at http://127.0.0.1:8000   (close this window or press Ctrl+C to stop)
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
goto :eof

:error
echo [QueueWise] Setup failed. See README.md for the manual steps.
pause
exit /b 1
