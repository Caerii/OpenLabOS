"""
Session + session_steps persistence. Explicit SQL, stdlib sqlite3 only.

``step_order`` in SQLite is an internal sort key (0..n-1 after protocol ordering).
API responses use protocol ``order`` and ``title`` instead - see ``SessionStepResponse``.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime

from openlabos_inference.models.protocol import ProtocolDocument, ProtocolStep
from openlabos_inference.models.session import (
    STEP_STATUS_VALUES,
    SessionDetailResponse,
    SessionStepResponse,
)
from openlabos_inference.services.protocol_registry import ProtocolRegistry


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def ordered_steps(protocol: ProtocolDocument) -> list[ProtocolStep]:
    """Lowest protocol ``order`` first; tie-break by original list index."""
    indexed = list(enumerate(protocol.steps))
    indexed.sort(
        key=lambda t: (
            t[1].order if t[1].order is not None else 10**9,
            t[0],
        ),
    )
    return [s for _, s in indexed]


def _steps_by_id(protocol: ProtocolDocument | None) -> dict[str, ProtocolStep]:
    if protocol is None:
        return {}
    return {s.step_id: s for s in protocol.steps}


def create_session(conn: sqlite3.Connection, protocol: ProtocolDocument) -> SessionDetailResponse:
    """
    Insert session and one row per protocol step; first sorted step active, rest pending.

    Runs inside the request-scoped SQLite connection from ``get_db`` (DEFERRED transaction +
    commit/rollback) so session + all steps commit or roll back together.
    """
    sid = str(uuid.uuid4())
    ts = _now_iso()
    steps_sorted = ordered_steps(protocol)
    pver = protocol.protocol_version

    conn.execute(
        """
        INSERT INTO sessions (session_id, protocol_id, protocol_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (sid, protocol.protocol_id, pver, ts, ts),
    )

    step_rows: list[SessionStepResponse] = []
    for order_idx, step in enumerate(steps_sorted):
        status = "active" if order_idx == 0 else "pending"
        if status not in STEP_STATUS_VALUES:
            raise RuntimeError(f"invalid status {status}")
        conn.execute(
            """
            INSERT INTO session_steps (session_id, step_id, step_order, status, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sid, step.step_id, order_idx, status, None, ts),
        )
        step_rows.append(
            SessionStepResponse(
                step_id=step.step_id,
                title=step.title,
                order=step.order,
                status=status,
                notes=None,
                updated_at=datetime.fromisoformat(ts),
            ),
        )

    return SessionDetailResponse(
        session_id=sid,
        protocol_id=protocol.protocol_id,
        protocol_version=pver,
        name=protocol.name,
        created_at=datetime.fromisoformat(ts),
        updated_at=datetime.fromisoformat(ts),
        steps=step_rows,
    )


def get_session(
    conn: sqlite3.Connection,
    session_id: str,
    registry: ProtocolRegistry,
) -> SessionDetailResponse | None:
    cur = conn.execute(
        """
        SELECT session_id, protocol_id, protocol_version, created_at, updated_at
        FROM sessions WHERE session_id = ?
        """,
        (session_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None

    protocol_id = row[1]
    stored_version = row[2]
    protocol = registry.get(protocol_id)
    by_id = _steps_by_id(protocol)

    sc = conn.execute(
        """
        SELECT step_id, step_order, status, notes, updated_at
        FROM session_steps
        WHERE session_id = ?
        ORDER BY step_order ASC, step_id ASC
        """,
        (session_id,),
    )
    steps: list[SessionStepResponse] = []
    for r in sc.fetchall():
        sid_key = r[0]
        pstep = by_id.get(sid_key)
        steps.append(
            SessionStepResponse(
                step_id=sid_key,
                title=pstep.title if pstep else "",
                order=pstep.order if pstep else None,
                status=r[2],
                notes=r[3],
                updated_at=datetime.fromisoformat(r[4]),
            ),
        )

    return SessionDetailResponse(
        session_id=row[0],
        protocol_id=protocol_id,
        protocol_version=stored_version,
        name=protocol.name if protocol else "",
        created_at=datetime.fromisoformat(row[3]),
        updated_at=datetime.fromisoformat(row[4]),
        steps=steps,
    )


def delete_session(conn: sqlite3.Connection, session_id: str) -> bool:
    """Delete session row; ``ON DELETE CASCADE`` removes ``session_steps``. Returns True if a row was removed."""
    cur = conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
    return cur.rowcount > 0
