"""
FastAPI entry: load protocol JSON at startup (fail fast), SQLite for sessions only.
"""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from openlabos_inference.api.routes import health, judgments, media, protocols, sessions
from openlabos_inference.config import load_settings
from openlabos_inference.persistence.sqlite import init_schema
from openlabos_inference.services.protocol_registry import ProtocolRegistry


@asynccontextmanager
async def lifespan(app: FastAPI):
    protocol_path, sqlite_path, data_root = load_settings()

    # Fail fast with clear errors (raised from load_protocol_from_path).
    registry = ProtocolRegistry.from_single_path(protocol_path)

    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(sqlite_path))
    try:
        init_schema(conn)
        conn.commit()
    finally:
        conn.close()

    # Registry is immutable after this point; routes use Depends(get_registry) -> app.state only.
    app.state.registry = registry
    app.state.sqlite_path = sqlite_path
    app.state.data_root = data_root
    yield


app = FastAPI(
    title="OpenLabOS Inference API",
    version="0.0.0",
    lifespan=lifespan,
)

# Local / LAN demos: browser may be on another origin:port than the API (e.g. Vite on :5173).
# Demo-only permissive CORS. Tighten allow_origins before any non-local deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(protocols.router)
app.include_router(sessions.router)
app.include_router(media.router)
app.include_router(judgments.router)


def run() -> None:
    import uvicorn

    uvicorn.run("openlabos_inference.main:app", host="127.0.0.1", port=8000, reload=False)
