from __future__ import annotations

import json
import sqlite3
import base64
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from openlabos_inference.api.deps import get_data_root, get_db, get_registry
from openlabos_inference.models.judgment import (
    JudgmentResponse,
    ListJudgmentsResponse,
    TriggerJudgmentRequest,
)
from openlabos_inference.persistence import judgment_repository, media_repository
from openlabos_inference.services.frame_selection import FrameSelectionError, select_frames_for_clip
from openlabos_inference.services.judgment_parsing import JudgmentParseError, parse_strict_json, validate_judgment
from openlabos_inference.services.judgment_prompt import build_step_prompt
from openlabos_inference.services.lmstudio_client import LmStudioError, chat_completions, load_lmstudio_config
from openlabos_inference.services.protocol_registry import ProtocolRegistry
from openlabos_inference.storage.media_paths import resolve_data_path

router = APIRouter(tags=["judgments"])


def _get_protocol_for_session(conn: sqlite3.Connection, *, session_id: str, registry: ProtocolRegistry):
    row = conn.execute("SELECT protocol_id FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    if row is None:
        return None
    return registry.get(row[0])


@router.post("/judgments", response_model=JudgmentResponse, status_code=status.HTTP_201_CREATED)
def trigger_judgment(
    body: TriggerJudgmentRequest,
    data_root: Path = Depends(get_data_root),
    registry: ProtocolRegistry = Depends(get_registry),
    conn: sqlite3.Connection = Depends(get_db),
) -> JudgmentResponse:
    clip = media_repository.get_clip(conn, clip_id=body.clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")

    step_id = body.step_id or clip.step_id
    if not step_id:
        raise HTTPException(status_code=422, detail="Clip has no step_id; provide step_id explicitly")
    if not media_repository.session_step_exists(conn, session_id=clip.session_id, step_id=step_id):
        raise HTTPException(status_code=422, detail="step_id is not a step in this session")

    protocol = _get_protocol_for_session(conn, session_id=clip.session_id, registry=registry)
    if protocol is None:
        raise HTTPException(status_code=404, detail="Session not found")
    step = next((s for s in protocol.steps if s.step_id == step_id), None)
    if step is None:
        raise HTTPException(status_code=422, detail="step_id not found in protocol document")

    try:
        frame_rel_paths = select_frames_for_clip(data_root=data_root, session_id=clip.session_id, clip_id=clip.clip_id)
    except FrameSelectionError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Build prompt (inspectable).
    prompt = build_step_prompt(protocol=protocol, step=step, frame_paths=frame_rel_paths)

    # Read frames and include as base64 images in OpenAI-compatible message content.
    # LM Studio expects `image_url` objects with data URLs for multimodal models.
    content_parts: list[dict] = [{"type": "text", "text": prompt.user}]
    for rel in frame_rel_paths:
        abs_path = resolve_data_path(data_root, rel)
        b = abs_path.read_bytes()
        # Keep it boring: assume jpeg/png based on extension.
        ext = abs_path.suffix.lower()
        mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp"
        data_url = f"data:{mime};base64,{base64.b64encode(b).decode('ascii')}"
        content_parts.append({"type": "image_url", "image_url": {"url": data_url}})

    cfg = load_lmstudio_config()
    payload = {
        "model": cfg.model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": prompt.system},
            {"role": "user", "content": content_parts},
        ],
    }

    try:
        resp = chat_completions(payload)
    except LmStudioError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    try:
        msg = resp["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=502, detail="LM Studio response missing choices/message/content") from e

    try:
        obj = parse_strict_json(msg if isinstance(msg, str) else json.dumps(msg))
        result = validate_judgment(obj)
    except JudgmentParseError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if result.step_id != step_id:
        raise HTTPException(status_code=502, detail="Model step_id did not match requested step_id")

    store_debug = os.environ.get("LABOS_JUDGMENT_STORE_DEBUG", "0").strip() == "1"
    stored = judgment_repository.insert_judgment(
        conn,
        session_id=clip.session_id,
        clip_id=clip.clip_id,
        step_id=step_id,
        result=result,
        model_id=cfg.model,
        prompt_text=prompt.user if store_debug else None,
        response_json=json.dumps(resp) if store_debug else None,
    )
    return stored


@router.get("/sessions/{session_id}/judgments", response_model=ListJudgmentsResponse)
def list_judgments(
    session_id: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> ListJudgmentsResponse:
    # 404 if session does not exist (avoid orphan querying).
    row = conn.execute("SELECT 1 FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    js = judgment_repository.list_judgments_for_session(conn, session_id=session_id)
    return ListJudgmentsResponse(session_id=session_id, judgments=js)
