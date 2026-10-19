"""FastAPI application.

Run locally:  uvicorn app.main:app --reload   (from the backend/ folder)

If the frontend has been built (frontend/dist exists), it is also served from
this process at http://127.0.0.1:8000/ so the whole demo runs from one command.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import ConfigValidationError, router
from .simulation import SIMULATOR_VERSION

app = FastAPI(
    title="QueueWise API",
    description="Delay-aware queue management lab: a deterministic bottleneck-link simulator. All results are simulated.",
    version=SIMULATOR_VERSION,
)

# Simulation responses are large, repetitive JSON; compress them.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Development only: allow the Vite dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validation_response(errors: list[dict[str, str]]) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"message": "Some settings are invalid. Fix the highlighted fields and try again.", "errors": errors},
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", []) if p != "body"]
        message = str(e.get("msg", "Invalid value")).removeprefix("Value error, ")
        errors.append({"field": ".".join(loc) or "body", "message": message})
    return _validation_response(errors)


@app.exception_handler(ConfigValidationError)
async def config_validation_handler(_: Request, exc: ConfigValidationError) -> JSONResponse:
    return _validation_response(exc.errors)


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"message": f"The simulation failed unexpectedly: {type(exc).__name__}: {exc}", "errors": []},
    )


app.include_router(router)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = (FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
