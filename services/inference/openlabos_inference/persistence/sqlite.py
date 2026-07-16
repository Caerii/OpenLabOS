"""Schema creation for session runtime tables (no protocol tables)."""

from __future__ import annotations

import sqlite3

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    protocol_id TEXT NOT NULL,
    protocol_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_steps (
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, step_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_captures (
    capture_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type TEXT,
    original_filename TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_clips (
    clip_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    capture_id TEXT NOT NULL,
    step_id TEXT,
    relative_path TEXT NOT NULL,
    start_ms INTEGER,
    end_ms INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (capture_id) REFERENCES media_captures(capture_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS judgments (
    judgment_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    judgment_schema_version TEXT,
    objects_seen_json TEXT NOT NULL,
    action_detected TEXT,
    step_complete INTEGER NOT NULL,
    possible_issue TEXT,
    confidence REAL NOT NULL,
    reason TEXT NOT NULL,
    model_id TEXT,
    prompt_text TEXT,
    response_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (clip_id) REFERENCES media_clips(clip_id) ON DELETE CASCADE
);
"""


def _migrate_sessions_protocol_version(conn: sqlite3.Connection) -> None:
    """Pre-protocol_version DBs: add column so older demo files stay openable (MVP: no Alembic)."""
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'",
    ).fetchone()
    if row is None:
        return
    cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    if "protocol_version" in cols:
        return
    conn.execute(
        "ALTER TABLE sessions ADD COLUMN protocol_version TEXT NOT NULL DEFAULT 'unknown'",
    )


def init_schema(conn: sqlite3.Connection) -> None:
    """Enable foreign keys before DDL so constraints are honored on this connection."""
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_SQL)
    # Enforce no duplicate registration for a session+path pair at the DB level too.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_media_captures_session_path ON media_captures(session_id, relative_path)",
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_media_clips_session_path ON media_clips(session_id, relative_path)",
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_judgments_session_created ON judgments(session_id, created_at)",
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_judgments_clip_created ON judgments(clip_id, created_at)",
    )
    _migrate_sessions_protocol_version(conn)
