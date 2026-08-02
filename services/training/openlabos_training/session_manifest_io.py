"""Filesystem readers for OpenLabOS session artifacts under data/sessions/."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class SessionManifestError(RuntimeError):
    pass


def sessions_dir(data_root: Path) -> Path:
    return data_root.resolve() / "sessions"


def session_root(data_root: Path, session_id: str) -> Path:
    return sessions_dir(data_root) / session_id


def session_json_path(data_root: Path, session_id: str) -> Path:
    return session_root(data_root, session_id) / "session.json"


def run_manifest_path(data_root: Path, session_id: str) -> Path:
    return session_root(data_root, session_id) / "manifest.json"


def load_json_object(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SessionManifestError(f"JSON file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SessionManifestError(f"Malformed JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise SessionManifestError(f"Expected JSON object in {path}")
    return data


def read_session_json(data_root: Path, session_id: str) -> dict[str, Any]:
    return load_json_object(session_json_path(data_root, session_id))


def read_run_manifest(data_root: Path, session_id: str) -> dict[str, Any]:
    return load_json_object(run_manifest_path(data_root, session_id))


def list_session_ids(data_root: Path) -> list[str]:
    root = sessions_dir(data_root)
    if not root.is_dir():
        return []
    return sorted(
        p.name
        for p in root.iterdir()
        if p.is_dir() and (p / "session.json").is_file()
    )


def protocol_id_from_session(data_root: Path, session_id: str) -> str:
    """Resolve protocol_id from data/sessions/<id>/session.json."""
    session = read_session_json(data_root, session_id)
    protocol_id = session.get("protocol_id")
    if not isinstance(protocol_id, str) or not protocol_id.strip():
        raise SessionManifestError(
            f"session.json for {session_id!r} is missing protocol_id",
        )
    return protocol_id.strip()


def protocol_id_from_run_manifest(data_root: Path, session_id: str) -> str:
    """Resolve protocol_id from data/sessions/<id>/manifest.json (RunManifest)."""
    manifest = read_run_manifest(data_root, session_id)
    session = manifest.get("session")
    if isinstance(session, dict):
        protocol_id = session.get("protocol_id")
        if isinstance(protocol_id, str) and protocol_id.strip():
            return protocol_id.strip()
    raise SessionManifestError(
        f"manifest.json for {session_id!r} is missing session.protocol_id",
    )


def resolve_protocol_id(
    *,
    data_root: Path | None,
    session_id: str,
    sqlite_conn=None,
) -> str:
    """
    Prefer filesystem session manifests; fall back to legacy SQLite sessions table.
    """
    if data_root is not None:
        session_path = session_json_path(data_root, session_id)
        if session_path.is_file():
            return protocol_id_from_session(data_root, session_id)
        manifest_path = run_manifest_path(data_root, session_id)
        if manifest_path.is_file():
            return protocol_id_from_run_manifest(data_root, session_id)

    if sqlite_conn is not None:
        row = sqlite_conn.execute(
            "SELECT protocol_id FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is not None:
            return str(row[0])

    raise SessionManifestError(
        f"Could not resolve protocol_id for session_id={session_id!r} "
        f"(checked data/sessions and SQLite)",
    )
