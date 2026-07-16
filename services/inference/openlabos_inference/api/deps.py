"""FastAPI dependencies."""

from __future__ import annotations

import sqlite3
from collections.abc import Generator
from pathlib import Path

from fastapi import Request

from openlabos_inference.services.protocol_registry import ProtocolRegistry


def get_registry(request: Request) -> ProtocolRegistry:
    return request.app.state.registry


def get_db(request: Request) -> Generator[sqlite3.Connection, None, None]:
    path: Path = request.app.state.sqlite_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # One transaction per request: all route SQL commits together or rolls back on error.
    conn.isolation_level = "DEFERRED"
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_data_root(request: Request) -> Path:
    return request.app.state.data_root
