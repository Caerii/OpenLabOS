"""Deterministic frame selection for judging a clip."""

from __future__ import annotations

import os
from pathlib import Path

from openlabos_inference.storage.media_paths import MediaPathError, resolve_data_path


class FrameSelectionError(RuntimeError):
    pass


def max_frames() -> int:
    return int(os.environ.get("LABOS_JUDGMENT_MAX_FRAMES", "8"))


def select_frames_for_clip(*, data_root: Path, session_id: str, clip_id: str) -> list[str]:
    """
    Policy (MVP):
    - list all extracted frames under `processed/<session_id>/frames/<clip_id>/`
    - sort lexically (frame-000001.jpg ...)
    - take first N (LABOS_JUDGMENT_MAX_FRAMES, default 8)
    """
    rel_dir = f"processed/{session_id}/frames/{clip_id}"
    try:
        abs_dir = resolve_data_path(data_root, rel_dir)
    except MediaPathError as e:
        raise FrameSelectionError(str(e)) from e

    if not abs_dir.exists():
        raise FrameSelectionError(f"Frames directory missing: {rel_dir}")

    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = [p for p in abs_dir.glob("*") if p.is_file() and p.suffix.lower() in exts]
    files.sort(key=lambda p: p.name)

    n = max_frames()
    picked = files[:n]
    if not picked:
        raise FrameSelectionError(f"No frame files found in {rel_dir}")
    return [p.relative_to(data_root.resolve()).as_posix() for p in picked]
