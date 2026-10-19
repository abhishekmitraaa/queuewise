#!/usr/bin/env sh
# QueueWise one-command demo for macOS / Linux: sets up (first run only), then
# serves the app at http://127.0.0.1:8000 from the local Python backend.
set -e
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/python ]; then
  echo "[QueueWise] Creating the Python virtual environment..."
  python3 -m venv backend/.venv
  backend/.venv/bin/python -m pip install -r backend/requirements.txt
fi

if [ ! -f frontend/dist/index.html ]; then
  echo "[QueueWise] Building the frontend..."
  (cd frontend && npm install && npm run build)
fi

echo "[QueueWise] Open http://127.0.0.1:8000  (Ctrl+C to stop)"
cd backend
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
