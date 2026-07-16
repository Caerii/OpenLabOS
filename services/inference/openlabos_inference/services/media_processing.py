"""Synchronous local media processing: capture -> clips -> sampled frames."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from openlabos_inference.services.ffmpeg import FfmpegError, probe_duration_ms, run_ffmpeg
from openlabos_inference.storage.media_paths import MediaLayout, resolve_data_path


class MediaProcessingError(RuntimeError):
    pass


@dataclass(frozen=True)
class SamplingPolicy:
    clip_duration_ms: int
    frame_fps: float


@dataclass(frozen=True)
class ClipSpec:
    start_ms: int
    end_ms: int


def compute_fixed_chunks(duration_ms: int, clip_duration_ms: int) -> list[ClipSpec]:
    if clip_duration_ms <= 0:
        raise MediaProcessingError("clip_duration_ms must be > 0")
    if duration_ms <= 0:
        return []
    specs: list[ClipSpec] = []
    start = 0
    while start < duration_ms:
        end = min(start + clip_duration_ms, duration_ms)
        if end <= start:
            break
        specs.append(ClipSpec(start_ms=start, end_ms=end))
        start = end
    return specs


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _rm_tree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def slice_clip(
    *,
    capture_path: Path,
    clip_path: Path,
    start_ms: int,
    end_ms: int,
    overwrite: bool,
) -> None:
    if not capture_path.exists():
        raise MediaProcessingError(f"Capture file missing: {capture_path}")
    if clip_path.exists() and not overwrite:
        raise MediaProcessingError(f"Clip already exists (use overwrite): {clip_path}")
    if start_ms < 0 or end_ms <= start_ms:
        raise MediaProcessingError("Invalid clip time range")

    _ensure_parent(clip_path)
    if overwrite and clip_path.exists():
        clip_path.unlink()

    # Note: -c copy keeps it fast and inspectable. Some formats may cut on keyframes.
    try:
        run_ffmpeg(
            [
                "-ss",
                f"{start_ms/1000.0:.3f}",
                "-i",
                str(capture_path),
                "-t",
                f"{(end_ms-start_ms)/1000.0:.3f}",
                "-c",
                "copy",
                str(clip_path),
            ],
        )
    except FfmpegError as e:
        if clip_path.exists():
            clip_path.unlink()
        raise MediaProcessingError(str(e)) from e


def extract_frames(
    *,
    clip_path: Path,
    frames_dir: Path,
    fps: float,
    overwrite: bool,
) -> None:
    if fps <= 0:
        raise MediaProcessingError("frame fps must be > 0")
    if not clip_path.exists():
        raise MediaProcessingError(f"Clip file missing: {clip_path}")
    if frames_dir.exists() and not overwrite:
        # Treat any existing dir as a conflict to keep runs deterministic.
        raise MediaProcessingError(f"Frames directory already exists (use overwrite): {frames_dir}")

    if overwrite:
        _rm_tree(frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)

    out_pattern = str(frames_dir / "frame-%06d.jpg")
    try:
        run_ffmpeg(
            [
                "-i",
                str(clip_path),
                # Force a broadly compatible JPEG pixel format for odd sources (e.g. yuv444p).
                "-vf",
                f"fps={fps},format=yuvj420p",
                "-pix_fmt",
                "yuvj420p",
                "-q:v",
                "2",
                out_pattern,
            ],
        )
    except FfmpegError as e:
        _rm_tree(frames_dir)
        raise MediaProcessingError(str(e)) from e


def derive_clip_relative_path(session_id: str, clip_id: str) -> str:
    rel = PurePosixPath("processed") / session_id / "clips" / f"{clip_id}.mp4"
    return rel.as_posix()


def derive_frames_dir_relative_path(session_id: str, clip_id: str) -> str:
    rel = PurePosixPath("processed") / session_id / "frames" / clip_id
    return rel.as_posix()


def process_capture_to_clips_and_frames(
    *,
    data_root: Path,
    session_id: str,
    capture_relative_path: str,
    clip_ids_and_specs: list[tuple[str, ClipSpec]],
    policy: SamplingPolicy,
    overwrite: bool,
) -> None:
    """
    Execute the filesystem work for a set of clip specs, using pre-chosen clip_ids (id-driven naming).
    """
    capture_path = resolve_data_path(data_root, capture_relative_path)

    created: list[tuple[Path, Path]] = []
    try:
        for clip_id, spec in clip_ids_and_specs:
            clip_rel = derive_clip_relative_path(session_id, clip_id)
            frames_rel = derive_frames_dir_relative_path(session_id, clip_id)
            clip_path = resolve_data_path(data_root, clip_rel)
            frames_dir = resolve_data_path(data_root, frames_rel)

            slice_clip(
                capture_path=capture_path,
                clip_path=clip_path,
                start_ms=spec.start_ms,
                end_ms=spec.end_ms,
                overwrite=overwrite,
            )
            extract_frames(
                clip_path=clip_path,
                frames_dir=frames_dir,
                fps=policy.frame_fps,
                overwrite=overwrite,
            )
            created.append((clip_path, frames_dir))
    except Exception:
        # Best-effort cleanup so a failed run doesn't leave half a pipeline on disk.
        for clip_path, frames_dir in reversed(created):
            if clip_path.exists():
                clip_path.unlink()
            _rm_tree(frames_dir)
        raise


def plan_fixed_chunk_processing(
    *,
    capture_path: Path,
    clip_duration_ms: int,
    max_ms: int | None = None,
) -> list[ClipSpec]:
    duration_ms = probe_duration_ms(capture_path)
    if max_ms is not None:
        duration_ms = min(duration_ms, max_ms)
    return compute_fixed_chunks(duration_ms, clip_duration_ms)
