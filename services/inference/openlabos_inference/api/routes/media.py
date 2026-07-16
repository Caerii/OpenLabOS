from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from openlabos_inference.api.deps import get_data_root, get_db
from openlabos_inference.models.media import (
    AssociateClipStepRequest,
    CreateClipRequest,
    MediaCaptureResponse,
    MediaClipResponse,
    RegisterCaptureRequest,
    SessionMediaResponse,
)
from openlabos_inference.persistence import media_repository
from openlabos_inference.storage.media_paths import MediaLayout, MediaPathError, resolve_data_path

router = APIRouter(tags=["media"])


def _list_frame_files(data_root: Path, session_id: str) -> list[str]:
    """
    File-only view of extracted frames.
    No extraction occurs in this prompt; this is purely a discoverable layout contract.
    """
    layout = MediaLayout(data_root=data_root)
    rel_dir = layout.frames_session_dir(session_id)
    abs_dir = resolve_data_path(data_root, str(rel_dir))
    if not abs_dir.exists():
        return []
    # Keep it boring: only common image extensions, sorted, cap list size.
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    paths: list[str] = []
    for p in abs_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in exts:
            rel = p.relative_to(data_root.resolve()).as_posix()
            paths.append(rel)
    paths.sort()
    return paths[:1000]


@router.post(
    "/sessions/{session_id}/media/captures",
    response_model=MediaCaptureResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_capture(
    session_id: str,
    body: RegisterCaptureRequest,
    data_root: Path = Depends(get_data_root),
    conn: sqlite3.Connection = Depends(get_db),
):
    if not media_repository.session_exists(conn, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        abs_path = resolve_data_path(data_root, body.relative_path)
    except MediaPathError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if not abs_path.exists():
        raise HTTPException(
            status_code=422,
            detail=f"File not found under data root: {body.relative_path!r}",
        )

    existing = media_repository.find_capture_by_session_and_path(
        conn,
        session_id=session_id,
        relative_path=body.relative_path.replace("\\", "/").strip(),
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Capture already registered for this session and path",
        )

    return media_repository.register_capture(
        conn,
        session_id=session_id,
        source=body.source,
        relative_path=body.relative_path.replace("\\", "/").strip(),
        mime_type=body.mime_type,
        original_filename=body.original_filename,
    )


@router.post(
    "/sessions/{session_id}/media/clips",
    response_model=MediaClipResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_clip(
    session_id: str,
    body: CreateClipRequest,
    data_root: Path = Depends(get_data_root),
    conn: sqlite3.Connection = Depends(get_db),
) -> MediaClipResponse:
    if not media_repository.session_exists(conn, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    if not media_repository.capture_belongs_to_session(conn, capture_id=body.capture_id, session_id=session_id):
        raise HTTPException(status_code=422, detail="capture_id does not exist for this session")

    if body.step_id is not None and not media_repository.session_step_exists(
        conn,
        session_id=session_id,
        step_id=body.step_id,
    ):
        raise HTTPException(status_code=422, detail="step_id is not a step in this session")

    try:
        resolve_data_path(data_root, body.relative_path)
    except MediaPathError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return media_repository.create_clip(
        conn,
        session_id=session_id,
        capture_id=body.capture_id,
        relative_path=body.relative_path.replace("\\", "/").strip(),
        start_ms=body.start_ms,
        end_ms=body.end_ms,
        step_id=body.step_id,
    )


@router.patch("/media/clips/{clip_id}/step", response_model=MediaClipResponse)
def associate_clip_with_step(
    clip_id: str,
    body: AssociateClipStepRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> MediaClipResponse:
    # Ensure step exists in the clip's session (keep linkage honest).
    row = conn.execute("SELECT session_id FROM media_clips WHERE clip_id = ?", (clip_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Clip not found")
    session_id = row[0]
    if not media_repository.session_step_exists(conn, session_id=session_id, step_id=body.step_id):
        raise HTTPException(status_code=422, detail="step_id is not a step in this session")

    updated = media_repository.associate_clip_step(conn, clip_id=clip_id, step_id=body.step_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Clip not found")
    return updated


@router.get("/sessions/{session_id}/media", response_model=SessionMediaResponse)
def list_session_media(
    session_id: str,
    data_root: Path = Depends(get_data_root),
    conn: sqlite3.Connection = Depends(get_db),
) -> SessionMediaResponse:
    if not media_repository.session_exists(conn, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    captures, clips = media_repository.list_media_for_session(conn, session_id=session_id)
    frames = _list_frame_files(data_root, session_id)
    return SessionMediaResponse(
        session_id=session_id,
        captures=captures,
        clips=clips,
        frames=[{"relative_path": p} for p in frames],
    )
