"""Vercel serverless entry point.

Vercel runs this file as a Python function; vercel.json rewrites every /api/*
request here. It exposes the same FastAPI app used locally (backend/app/main.py).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
