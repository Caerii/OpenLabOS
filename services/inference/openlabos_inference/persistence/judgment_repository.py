"""Judgment persistence: explicit SQL, stdlib sqlite3 only."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime

from openlabos_inference.models.judgment import JudgmentResponse, JudgmentResult


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def insert_judgment(
    conn: sqlite3.Connection,
    *,
    session_id: str,
    clip_id: str,
    step_id: str,
    result: JudgmentResult,
    model_id: str | None,
    prompt_text: str | None,
    response_json: str | None,
) -> JudgmentResponse:
    jid = str(uuid.uuid4())
    ts = _now_iso()
    objects_seen_json = json.dumps(result.objects_seen)
    conn.execute(
        """
        INSERT INTO judgments (
            judgment_id, session_id, clip_id, step_id,
            judgment_schema_version, objects_seen_json, action_detected, step_complete,
            possible_issue, confidence, reason,
            model_id, prompt_text, response_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            jid,
            session_id,
            clip_id,
            step_id,
            result.judgment_schema_version,
            objects_seen_json,
            result.action_detected,
            1 if result.step_complete else 0,
            result.possible_issue,
            float(result.confidence),
            result.reason,
            model_id,
            prompt_text,
            response_json,
            ts,
        ),
    )
    return JudgmentResponse(
        judgment_id=jid,
        session_id=session_id,
        clip_id=clip_id,
        created_at=datetime.fromisoformat(ts),
        result=result,
    )


def list_judgments_for_session(conn: sqlite3.Connection, *, session_id: str) -> list[JudgmentResponse]:
    out: list[JudgmentResponse] = []
    rows = conn.execute(
        """
        SELECT judgment_id, session_id, clip_id, step_id,
               judgment_schema_version, objects_seen_json, action_detected, step_complete,
               possible_issue, confidence, reason, created_at
        FROM judgments
        WHERE session_id = ?
        ORDER BY created_at ASC, judgment_id ASC
        """,
        (session_id,),
    ).fetchall()
    for r in rows:
        objects = json.loads(r[5] or "[]")
        result = JudgmentResult(
            step_id=r[3],
            judgment_schema_version=r[4] or "1",
            objects_seen=objects,
            action_detected=r[6],
            step_complete=bool(r[7]),
            possible_issue=r[8],
            confidence=float(r[9]),
            reason=r[10],
        )
        out.append(
            JudgmentResponse(
                judgment_id=r[0],
                session_id=r[1],
                clip_id=r[2],
                created_at=datetime.fromisoformat(r[11]),
                result=result,
            ),
        )
    return out
