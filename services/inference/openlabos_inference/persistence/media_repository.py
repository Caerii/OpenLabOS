"""Media persistence: explicit SQL, stdlib sqlite3 only."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime

from openlabos_inference.models.media import MediaCaptureResponse, MediaClipResponse

_CAPTURE_STATUS = "registered"
_CLIP_STATUS_REGISTERED = "registered"
_CLIP_STATUS_GENERATED = "generated"


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _require_session(conn: sqlite3.Connection, session_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    return row is not None


def register_capture(
    conn: sqlite3.Connection,
    *,
    session_id: str,
    source: str,
    relative_path: str,
    mime_type: str | None,
    original_filename: str | None,
) -> MediaCaptureResponse:
    cap_id = str(uuid.uuid4())
    ts = _now_iso()
    conn.execute(
        """
        INSERT INTO media_captures (
            capture_id, session_id, source, relative_path, mime_type, original_filename, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (cap_id, session_id, source, relative_path, mime_type, original_filename, _CAPTURE_STATUS, ts, ts),
    )
    return MediaCaptureResponse(
        capture_id=cap_id,
        session_id=session_id,
        source=source,  # type: ignore[arg-type]
        relative_path=relative_path,
        mime_type=mime_type,
        original_filename=original_filename,
        status=_CAPTURE_STATUS,  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(ts),
        updated_at=datetime.fromisoformat(ts),
    )


def create_clip(
    conn: sqlite3.Connection,
    *,
    session_id: str,
    capture_id: str,
    relative_path: str,
    start_ms: int | None,
    end_ms: int | None,
    step_id: str | None,
) -> MediaClipResponse:
    clip_id = str(uuid.uuid4())
    ts = _now_iso()
    conn.execute(
        """
        INSERT INTO media_clips (
            clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clip_id,
            session_id,
            capture_id,
            step_id,
            relative_path,
            start_ms,
            end_ms,
            _CLIP_STATUS_REGISTERED,
            ts,
            ts,
        ),
    )
    return MediaClipResponse(
        clip_id=clip_id,
        session_id=session_id,
        capture_id=capture_id,
        step_id=step_id,
        relative_path=relative_path,
        start_ms=start_ms,
        end_ms=end_ms,
        status=_CLIP_STATUS_REGISTERED,  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(ts),
        updated_at=datetime.fromisoformat(ts),
    )


def create_generated_clip(
    conn: sqlite3.Connection,
    *,
    clip_id: str,
    session_id: str,
    capture_id: str,
    relative_path: str,
    start_ms: int,
    end_ms: int,
) -> MediaClipResponse:
    ts = _now_iso()
    conn.execute(
        """
        INSERT INTO media_clips (
            clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clip_id,
            session_id,
            capture_id,
            None,
            relative_path,
            start_ms,
            end_ms,
            _CLIP_STATUS_GENERATED,
            ts,
            ts,
        ),
    )
    return MediaClipResponse(
        clip_id=clip_id,
        session_id=session_id,
        capture_id=capture_id,
        step_id=None,
        relative_path=relative_path,
        start_ms=start_ms,
        end_ms=end_ms,
        status=_CLIP_STATUS_GENERATED,  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(ts),
        updated_at=datetime.fromisoformat(ts),
    )


def get_capture(conn: sqlite3.Connection, *, capture_id: str) -> MediaCaptureResponse | None:
    r = conn.execute(
        """
        SELECT capture_id, session_id, source, relative_path, mime_type, original_filename, status, created_at, updated_at
        FROM media_captures WHERE capture_id = ?
        """,
        (capture_id,),
    ).fetchone()
    if r is None:
        return None
    return MediaCaptureResponse(
        capture_id=r[0],
        session_id=r[1],
        source=r[2],  # type: ignore[arg-type]
        relative_path=r[3],
        mime_type=r[4],
        original_filename=r[5],
        status=r[6],  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(r[7]),
        updated_at=datetime.fromisoformat(r[8]),
    )


def get_clip(conn: sqlite3.Connection, *, clip_id: str) -> MediaClipResponse | None:
    r = conn.execute(
        """
        SELECT clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        FROM media_clips WHERE clip_id = ?
        """,
        (clip_id,),
    ).fetchone()
    if r is None:
        return None
    return MediaClipResponse(
        clip_id=r[0],
        session_id=r[1],
        capture_id=r[2],
        step_id=r[3],
        relative_path=r[4],
        start_ms=r[5],
        end_ms=r[6],
        status=r[7],  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(r[8]),
        updated_at=datetime.fromisoformat(r[9]),
    )


def list_generated_clips_for_capture(
    conn: sqlite3.Connection,
    *,
    capture_id: str,
) -> list[MediaClipResponse]:
    clips: list[MediaClipResponse] = []
    for r in conn.execute(
        """
        SELECT clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        FROM media_clips
        WHERE capture_id = ? AND status = ?
        ORDER BY start_ms ASC, clip_id ASC
        """,
        (capture_id, _CLIP_STATUS_GENERATED),
    ).fetchall():
        clips.append(
            MediaClipResponse(
                clip_id=r[0],
                session_id=r[1],
                capture_id=r[2],
                step_id=r[3],
                relative_path=r[4],
                start_ms=r[5],
                end_ms=r[6],
                status=r[7],  # type: ignore[arg-type]
                created_at=datetime.fromisoformat(r[8]),
                updated_at=datetime.fromisoformat(r[9]),
            ),
        )
    return clips


def delete_clips_by_ids(conn: sqlite3.Connection, *, clip_ids: list[str]) -> int:
    if not clip_ids:
        return 0
    q = ",".join(["?"] * len(clip_ids))
    cur = conn.execute(f"DELETE FROM media_clips WHERE clip_id IN ({q})", tuple(clip_ids))
    return int(cur.rowcount or 0)


def associate_clip_step(conn: sqlite3.Connection, *, clip_id: str, step_id: str) -> MediaClipResponse | None:
    ts = _now_iso()
    cur = conn.execute(
        "UPDATE media_clips SET step_id = ?, updated_at = ? WHERE clip_id = ?",
        (step_id, ts, clip_id),
    )
    if cur.rowcount == 0:
        return None
    row = conn.execute(
        """
        SELECT clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        FROM media_clips WHERE clip_id = ?
        """,
        (clip_id,),
    ).fetchone()
    if row is None:
        return None
    return MediaClipResponse(
        clip_id=row[0],
        session_id=row[1],
        capture_id=row[2],
        step_id=row[3],
        relative_path=row[4],
        start_ms=row[5],
        end_ms=row[6],
        status=row[7],  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(row[8]),
        updated_at=datetime.fromisoformat(row[9]),
    )


def list_media_for_session(
    conn: sqlite3.Connection,
    *,
    session_id: str,
) -> tuple[list[MediaCaptureResponse], list[MediaClipResponse]]:
    captures: list[MediaCaptureResponse] = []
    clips: list[MediaClipResponse] = []

    for r in conn.execute(
        """
        SELECT capture_id, session_id, source, relative_path, mime_type, original_filename, status, created_at, updated_at
        FROM media_captures WHERE session_id = ?
        ORDER BY created_at ASC, capture_id ASC
        """,
        (session_id,),
    ).fetchall():
        captures.append(
            MediaCaptureResponse(
                capture_id=r[0],
                session_id=r[1],
                source=r[2],  # type: ignore[arg-type]
                relative_path=r[3],
                mime_type=r[4],
                original_filename=r[5],
                status=r[6],  # type: ignore[arg-type]
                created_at=datetime.fromisoformat(r[7]),
                updated_at=datetime.fromisoformat(r[8]),
            ),
        )

    for r in conn.execute(
        """
        SELECT clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        FROM media_clips WHERE session_id = ?
        ORDER BY created_at ASC, clip_id ASC
        """,
        (session_id,),
    ).fetchall():
        clips.append(
            MediaClipResponse(
                clip_id=r[0],
                session_id=r[1],
                capture_id=r[2],
                step_id=r[3],
                relative_path=r[4],
                start_ms=r[5],
                end_ms=r[6],
                status=r[7],  # type: ignore[arg-type]
                created_at=datetime.fromisoformat(r[8]),
                updated_at=datetime.fromisoformat(r[9]),
            ),
        )

    return captures, clips


def session_exists(conn: sqlite3.Connection, session_id: str) -> bool:
    return _require_session(conn, session_id)


def capture_exists(conn: sqlite3.Connection, *, capture_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM media_captures WHERE capture_id = ?", (capture_id,)).fetchone()
    return row is not None


def capture_belongs_to_session(conn: sqlite3.Connection, *, capture_id: str, session_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM media_captures WHERE capture_id = ? AND session_id = ?",
        (capture_id, session_id),
    ).fetchone()
    return row is not None


def session_step_exists(conn: sqlite3.Connection, *, session_id: str, step_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM session_steps WHERE session_id = ? AND step_id = ?",
        (session_id, step_id),
    ).fetchone()
    return row is not None


def find_capture_by_session_and_path(
    conn: sqlite3.Connection,
    *,
    session_id: str,
    relative_path: str,
) -> MediaCaptureResponse | None:
    r = conn.execute(
        """
        SELECT capture_id, session_id, source, relative_path, mime_type, original_filename, status, created_at, updated_at
        FROM media_captures
        WHERE session_id = ? AND relative_path = ?
        """,
        (session_id, relative_path),
    ).fetchone()
    if r is None:
        return None
    return MediaCaptureResponse(
        capture_id=r[0],
        session_id=r[1],
        source=r[2],  # type: ignore[arg-type]
        relative_path=r[3],
        mime_type=r[4],
        original_filename=r[5],
        status=r[6],  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(r[7]),
        updated_at=datetime.fromisoformat(r[8]),
    )
