"""Media DTOs for the MVP ingestion contract (no uploads, no ffmpeg, no streaming)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Keep vocabularies closed and boring (documented in services/inference/README.md + capture runbook).
CaptureStatus = Literal["registered"]
ClipStatus = Literal["registered", "generated"]

# Where the raw capture file came from, conceptually (not a path):
# - upload: future direct HTTP upload writes to data/ then registers
# - ingest_dir: future tool copies from device sync/capture directory to data/ then registers
CaptureSource = Literal["upload", "ingest_dir"]


class RegisterCaptureRequest(BaseModel):
    """
    Register an already-present raw capture on disk for a session.

    The API does not upload bytes in this task; callers provide a `relative_path` under the data root.
    """

    model_config = {"extra": "forbid"}

    source: CaptureSource
    relative_path: str = Field(
        min_length=1,
        description="Path relative to LABOS_DATA_ROOT (default: repo `data/`), e.g. `raw/captures/<session_id>/capture.mp4`.",
    )
    mime_type: str | None = None
    original_filename: str | None = None


class MediaCaptureResponse(BaseModel):
    capture_id: str
    session_id: str
    source: CaptureSource
    relative_path: str
    mime_type: str | None = None
    original_filename: str | None = None
    status: CaptureStatus
    created_at: datetime
    updated_at: datetime


class CreateClipRequest(BaseModel):
    """Register a clip placeholder (no slicing performed)."""

    model_config = {"extra": "forbid"}

    capture_id: str = Field(min_length=1)
    relative_path: str = Field(
        min_length=1,
        description="Path relative to LABOS_DATA_ROOT, typically under `processed/<session_id>/clips/`.",
    )
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    step_id: str | None = Field(default=None, description="Optional protocol step_id this clip is associated with.")


class MediaClipResponse(BaseModel):
    clip_id: str
    session_id: str
    capture_id: str
    step_id: str | None
    relative_path: str
    start_ms: int | None
    end_ms: int | None
    status: ClipStatus
    created_at: datetime
    updated_at: datetime


class AssociateClipStepRequest(BaseModel):
    model_config = {"extra": "forbid"}

    step_id: str = Field(min_length=1)


class MediaFrameFileResponse(BaseModel):
    """
    File-backed frame reference. Frames are not persisted in SQLite in this MVP.

    When extraction exists, we can either keep this file-only view or promote frames to first-class DB rows.
    """

    relative_path: str


class SessionMediaResponse(BaseModel):
    session_id: str
    captures: list[MediaCaptureResponse]
    clips: list[MediaClipResponse]
    frames: list[MediaFrameFileResponse]
