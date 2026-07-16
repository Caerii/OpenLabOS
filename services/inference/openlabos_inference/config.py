"""Runtime paths and environment overrides (pathlib-only)."""

from __future__ import annotations

import os
from pathlib import Path


def _repo_root_from_here() -> Path:
    """openlabos_inference/config.py -> openlabos_inference -> services/inference -> services -> repo root."""
    return Path(__file__).resolve().parent.parent.parent.parent


def default_protocol_path() -> Path:
    """Default: monorepo packages/protocol-schema/examples/kitchen-tea-v1.json."""
    return (
        _repo_root_from_here()
        / "packages"
        / "protocol-schema"
        / "examples"
        / "kitchen-tea-v1.json"
    )


def default_sqlite_path() -> Path:
    """SQLite file under services/inference/var (created on startup if missing)."""
    api_root = Path(__file__).resolve().parent.parent
    return api_root / "var" / "labos_sessions.sqlite"


def default_data_root() -> Path:
    """Repo-local data root (see repo `data/README.md`)."""
    return _repo_root_from_here() / "data"


def load_settings() -> tuple[Path, Path, Path]:
    """
    Returns (protocol_json_path, sqlite_path, data_root).
    LABOS_PROTOCOL_PATH, LABOS_SQLITE_PATH, and LABOS_DATA_ROOT override defaults when set.
    """
    proto = os.environ.get("LABOS_PROTOCOL_PATH")
    protocol_path = Path(proto).resolve() if proto else default_protocol_path()

    db = os.environ.get("LABOS_SQLITE_PATH")
    sqlite_path = Path(db).resolve() if db else default_sqlite_path()

    data = os.environ.get("LABOS_DATA_ROOT")
    data_root = Path(data).resolve() if data else default_data_root()

    return protocol_path, sqlite_path, data_root
