"""
Standalone OpenLabOS-shaped inference app.

The legacy ``main.py`` boots an imperative SQLite-backed flow with a
fixed protocol-on-disk dependency. The OpenLabOS contract is simpler:
one provider gateway, one POST /v1/judgments endpoint, no per-process
state. This module is the new entry point.

Run via:
    uv run openlabos-inference

(or set OPENLABOS_PROVIDER=ollama and curl http://localhost:8000/v1/health)
"""
from __future__ import annotations

import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from openlabos_inference.api.routes.openlabos_judgments import router as judgments_router

app = FastAPI(
    title="OpenLabOS Inference API",
    description=(
        "Reasoning gateway for OpenLabOS: routes provider calls (Ollama, "
        "OpenAI, Gemini, …) behind one judgment-shaped contract."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(judgments_router)

_started = time.monotonic()


@app.get("/v1/healthz")
def healthz() -> dict[str, object]:
    return {
        "ok": True,
        "service": "@openlabos/inference",
        "uptime_seconds": time.monotonic() - _started,
        "default_provider": os.environ.get("OPENLABOS_PROVIDER", "ollama"),
    }


def run() -> None:
    import uvicorn

    port = int(os.environ.get("OPENLABOS_INFERENCE_PORT", "8001"))
    host = os.environ.get("OPENLABOS_INFERENCE_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, reload=False)
