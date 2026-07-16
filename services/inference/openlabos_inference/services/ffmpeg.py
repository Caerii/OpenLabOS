"""Thin, explicit wrappers around ffmpeg/ffprobe (no background jobs)."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class FfmpegError(RuntimeError):
    pass


def require_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise FfmpegError("ffmpeg not found on PATH")
    if shutil.which("ffprobe") is None:
        raise FfmpegError("ffprobe not found on PATH")


@dataclass(frozen=True)
class FfmpegResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


def run_ffmpeg(args: list[str]) -> FfmpegResult:
    require_ffmpeg()
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", *args],
        capture_output=True,
        text=True,
    )
    res = FfmpegResult(args=args, returncode=proc.returncode, stdout=proc.stdout, stderr=proc.stderr)
    if proc.returncode != 0:
        raise FfmpegError(f"ffmpeg exited nonzero ({proc.returncode}). stderr:\n{proc.stderr}")
    return res


def run_ffprobe_json(args: list[str]) -> dict:
    require_ffmpeg()
    proc = subprocess.run(
        ["ffprobe", "-hide_banner", "-v", "error", "-print_format", "json", *args],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise FfmpegError(f"ffprobe exited nonzero ({proc.returncode}). stderr:\n{proc.stderr}")
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as e:
        raise FfmpegError("ffprobe returned malformed JSON") from e


def probe_duration_ms(path: Path) -> int:
    """
    Duration from container metadata. Good enough for deterministic chunking in MVP.
    """
    info = run_ffprobe_json(["-show_format", str(path)])
    dur_s = None
    if isinstance(info, dict):
        fmt = info.get("format") if isinstance(info.get("format"), dict) else None
        if fmt is not None:
            dur_s = fmt.get("duration")
    if dur_s is None:
        raise FfmpegError("ffprobe did not return format.duration")
    try:
        ms = int(float(dur_s) * 1000.0)
    except (TypeError, ValueError) as e:
        raise FfmpegError("ffprobe returned non-numeric duration") from e
    return max(ms, 0)
