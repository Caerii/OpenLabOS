from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from openlabos_inference.api.deps import get_db, get_registry
from openlabos_inference.models.session import CreateSessionRequest, SessionDetailResponse
from openlabos_inference.persistence import session_repository
from openlabos_inference.services.protocol_registry import ProtocolRegistry

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionDetailResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    body: CreateSessionRequest,
    registry: ProtocolRegistry = Depends(get_registry),
    conn: sqlite3.Connection = Depends(get_db),
) -> SessionDetailResponse:
    proto = registry.get(body.protocol_id)
    if proto is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown protocol_id: {body.protocol_id!r}",
        )
    return session_repository.create_session(conn, proto)


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(
    session_id: str,
    registry: ProtocolRegistry = Depends(get_registry),
    conn: sqlite3.Connection = Depends(get_db),
) -> SessionDetailResponse:
    row = session_repository.get_session(conn, session_id, registry)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return row


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Remove a session; ``session_steps`` rows cascade. For demo cleanup without deleting the DB file."""
    if not session_repository.delete_session(conn, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
