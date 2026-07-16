from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _which(exe: str) -> Optional[str]:
    return shutil.which(exe)


def _run(cmd: List[str], *, cwd: Optional[Path] = None) -> str:
    p = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"Command failed ({p.returncode}): {' '.join(cmd)}\n{p.stdout}")
    return p.stdout


def _require_yt_dlp() -> str:
    yt = _which("yt-dlp") or _which("yt-dlp.exe")
    if not yt:
        raise RuntimeError(
            "yt-dlp is not on PATH. Install it in this uv env (dependency added) or install globally.",
        )
    return yt


def _require_ffmpeg() -> str:
    ffmpeg = _which("ffmpeg") or _which("ffmpeg.exe")
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg is required for clip emission. Install ffmpeg and ensure it is on PATH.",
        )
    return ffmpeg


def _download_video(yt_dlp: str, url: str, out_dir: Path, *, cookies_from_browser: str = "") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(out_dir / "%(id)s.%(ext)s")
    cmd = [
        yt_dlp,
        "--no-playlist",
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        pattern,
        "--no-progress",
        "--newline",
        url,
    ]
    if cookies_from_browser:
        cmd = [
            yt_dlp,
            "--no-playlist",
            "--cookies-from-browser",
            cookies_from_browser,
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            pattern,
            "--no-progress",
            "--newline",
            url,
        ]
    _run(cmd)

    mp4s = sorted(out_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not mp4s:
        raise RuntimeError(f"No mp4 produced by yt-dlp in {out_dir}")
    return mp4s[0].resolve()


def _import_cv2():
    try:
        import cv2  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "OpenCV (cv2) is required for frame extraction. "
            "Install dependencies via `uv sync` in services/training.",
        ) from e
    return cv2


def _video_stats(video_path: Path) -> Tuple[float, float, int]:
    cv2 = _import_cv2()
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")
    native_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    if native_fps <= 1e-3:
        native_fps = 30.0
    duration_s = (frame_count / native_fps) if frame_count > 0 else 0.0
    return duration_s, native_fps, frame_count


def _extract_frames(
    *,
    video_path: Path,
    frames_dir: Path,
    stem: str,
    fps: float,
    max_frames: int,
    jpeg_quality: int,
    resize_max_side: int,
    timestamp_offset_ms: int = 0,
) -> List[Tuple[int, Path]]:
    cv2 = _import_cv2()
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if native_fps <= 1e-3:
        native_fps = 30.0

    step = max(int(round(native_fps / max(fps, 1e-6))), 1)

    frames_dir.mkdir(parents=True, exist_ok=True)
    out: List[Tuple[int, Path]] = []
    frame_idx = 0
    source_frame_idx = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if source_frame_idx % step != 0:
            source_frame_idx += 1
            continue
        ok, frame = cap.retrieve()
        if not ok or frame is None:
            source_frame_idx += 1
            continue

        h, w = frame.shape[:2]
        max_side = max(h, w)
        if resize_max_side > 0 and max_side > resize_max_side:
            scale = resize_max_side / float(max_side)
            nh = max(1, int(round(h * scale)))
            nw = max(1, int(round(w * scale)))
            frame = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)

        ts_ms = timestamp_offset_ms + int(round((source_frame_idx / native_fps) * 1000.0))
        out_path = frames_dir / f"{stem}__t{ts_ms}ms__f{source_frame_idx:06d}.jpg"
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(jpeg_quality)]
        if not cv2.imwrite(str(out_path), frame, encode_params):
            raise RuntimeError(f"Failed to write frame image: {out_path}")
        out.append((ts_ms, out_path.resolve()))

        frame_idx += 1
        if frame_idx >= max_frames:
            break
        source_frame_idx += 1

    cap.release()
    return out


def _write_clip_with_ffmpeg(
    *,
    ffmpeg: str,
    video_path: Path,
    clip_path: Path,
    start_seconds: float,
    duration_seconds: float,
) -> Path:
    clip_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-ss",
        f"{start_seconds:.3f}",
        "-i",
        str(video_path),
        "-t",
        f"{duration_seconds:.3f}",
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(clip_path),
    ]
    _run(cmd)
    if not clip_path.is_file():
        raise RuntimeError(f"Expected ffmpeg to write clip: {clip_path}")
    return clip_path.resolve()


def _copy_local_video(src: Path, dst_dir: Path) -> Path:
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / src.name
    if src.resolve() == dst.resolve():
        return dst.resolve()
    shutil.copy2(src, dst)
    return dst.resolve()


def _stable_source_id(row: "SourceRow", idx: int) -> str:
    seed = row.url or row.local_path or f"row-{idx}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]
    return f"src_{digest}"


def _safe_slug(value: str, *, fallback: str = "video") -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")
    return slug[:80] or fallback


def _build_clip_windows(
    *,
    duration_seconds: float,
    clip_length_seconds: float,
    clip_stride_seconds: float,
    minimum_clip_frames: int,
    target_fps: float,
    clip_max_per_video: int,
) -> List[Tuple[int, float, float]]:
    if clip_length_seconds <= 0:
        return [(0, 0.0, duration_seconds)]

    stride = clip_stride_seconds if clip_stride_seconds > 0 else clip_length_seconds
    windows: List[Tuple[int, float, float]] = []
    idx = 0
    start_s = 0.0
    while start_s < duration_seconds:
        end_s = min(start_s + clip_length_seconds, duration_seconds)
        if (end_s - start_s) * target_fps >= max(1, minimum_clip_frames):
            windows.append((idx, start_s, end_s))
        idx += 1
        if clip_max_per_video > 0 and len(windows) >= clip_max_per_video:
            break
        start_s += stride
    return windows


@dataclass(frozen=True)
class SourceRow:
    url: str = ""
    local_path: str = ""
    source: str = ""
    title: str = ""
    uploader: str = ""
    duration_seconds: str = ""
    license: str = ""
    query: str = ""
    split: str = "train"
    protocol_id: str = ""
    recipe: str = ""
    step_hint: str = ""
    label_hint: str = ""
    notes: str = ""


def _read_sources_csv(path: Path) -> List[SourceRow]:
    rows: List[SourceRow] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError(f"CSV is missing a header row: {path}")
        if "url" not in reader.fieldnames and "local_path" not in reader.fieldnames:
            raise RuntimeError("CSV must include either a `url` or `local_path` column.")
        for raw in reader:
            url = (raw.get("url") or "").strip()
            local_path = (raw.get("local_path") or "").strip()
            if not url and not local_path:
                continue
            rows.append(
                SourceRow(
                    url=url,
                    local_path=local_path,
                    source=(raw.get("source") or "").strip(),
                    title=(raw.get("title") or "").strip(),
                    uploader=(raw.get("uploader") or "").strip(),
                    duration_seconds=(raw.get("duration_seconds") or "").strip(),
                    license=(raw.get("license") or "").strip(),
                    query=(raw.get("query") or "").strip(),
                    split=(raw.get("split") or "train").strip() or "train",
                    protocol_id=(raw.get("protocol_id") or "").strip(),
                    recipe=(raw.get("recipe") or "").strip(),
                    step_hint=(raw.get("step_hint") or "").strip(),
                    label_hint=(raw.get("label_hint") or "").strip(),
                    notes=(raw.get("notes") or "").strip(),
                ),
            )
    if not rows:
        raise RuntimeError(f"No source rows found in {path}")
    return rows


def _resolve_local_video_path(local_path: str, *, local_video_root: Path) -> Path:
    p = Path(local_path)
    if not p.is_absolute():
        p = (local_video_root / p).resolve()
    else:
        p = p.resolve()
    if not p.is_file():
        raise RuntimeError(f"Local video not found: {p}")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Acquire videos from YouTube or local files, then emit clip/frame manifests for VLM evaluation.",
    )
    p.add_argument(
        "--sources-csv",
        required=True,
        help="CSV with `url` and/or `local_path` plus optional metadata columns.",
    )
    p.add_argument(
        "--out-root",
        required=True,
        help="Output root directory (will create videos/, clips/, frames/, manifests/).",
    )
    p.add_argument(
        "--local-video-root",
        default=".",
        help="Base directory used to resolve relative `local_path` values from the CSV.",
    )
    p.add_argument(
        "--copy-local-videos",
        action="store_true",
        help="Copy local source videos into out-root/videos/ for a self-contained dataset bundle.",
    )
    p.add_argument("--fps", type=float, default=2.0, help="Target frame sampling FPS. Qwen3.5 defaults are typically 2 FPS for video.")
    p.add_argument("--max-frames", type=int, default=12, help="Max frames per emitted sample.")
    p.add_argument("--jpeg-quality", type=int, default=85, help="JPEG quality 0-100.")
    p.add_argument(
        "--resize-max-side",
        type=int,
        default=960,
        help="Resize so max(width,height) <= this value. Use 0 to disable resizing.",
    )
    p.add_argument(
        "--clip-length-seconds",
        type=float,
        default=1.5,
        help="If >0, split each source video into short clips of this duration before frame extraction.",
    )
    p.add_argument(
        "--clip-stride-seconds",
        type=float,
        default=0.75,
        help="Stride between successive clip start times. 0 means use clip-length-seconds.",
    )
    p.add_argument(
        "--clip-max-per-video",
        type=int,
        default=24,
        help="Hard cap on emitted clips per source video. 0 means no cap.",
    )
    p.add_argument(
        "--minimum-clip-frames",
        type=int,
        default=3,
        help="Skip trailing windows that would yield fewer than this many sampled frames.",
    )
    p.add_argument(
        "--cookies-from-browser",
        default="",
        help="Optional yt-dlp cookies source, e.g. `chrome` or `edge`.",
    )
    p.add_argument(
        "--overwrite-manifests",
        action="store_true",
        help="Remove existing sources.jsonl, samples.jsonl, and frames.jsonl before writing this ingestion run.",
    )
    p.add_argument(
        "--limit-videos",
        type=int,
        default=0,
        help="Process only the first N source rows. 0 means process all rows.",
    )
    args = p.parse_args(argv)

    sources_path = Path(args.sources_csv).resolve()
    out_root = Path(args.out_root).resolve()
    local_video_root = Path(args.local_video_root).resolve()
    videos_dir = out_root / "videos"
    clips_dir = out_root / "clips"
    frames_dir = out_root / "frames"
    manifests_dir = out_root / "manifests"
    for d in (videos_dir, clips_dir, frames_dir, manifests_dir):
        d.mkdir(parents=True, exist_ok=True)

    rows = _read_sources_csv(sources_path)
    if args.limit_videos and args.limit_videos > 0:
        rows = rows[: int(args.limit_videos)]

    need_download = any(r.url for r in rows)
    yt_dlp = _require_yt_dlp() if need_download else ""
    ffmpeg = _require_ffmpeg() if args.clip_length_seconds > 0 else ""

    sources_manifest_path = manifests_dir / "sources.jsonl"
    samples_manifest_path = manifests_dir / "samples.jsonl"
    frames_manifest_path = manifests_dir / "frames.jsonl"
    if args.overwrite_manifests:
        sources_manifest_path.unlink(missing_ok=True)
        samples_manifest_path.unlink(missing_ok=True)
        frames_manifest_path.unlink(missing_ok=True)

    with sources_manifest_path.open("a", encoding="utf-8") as sources_file, samples_manifest_path.open(
        "a",
        encoding="utf-8",
    ) as samples_file, frames_manifest_path.open(
        "a",
        encoding="utf-8",
    ) as frames_file:
        for idx, row in enumerate(rows):
            source_id = _stable_source_id(row, idx)
            raw_source = row.source or ("youtube" if row.url else "local_file")
            video_dir = videos_dir / source_id

            if row.url:
                video_path = _download_video(
                    yt_dlp,
                    row.url,
                    video_dir,
                    cookies_from_browser=args.cookies_from_browser,
                )
            else:
                local_video = _resolve_local_video_path(row.local_path, local_video_root=local_video_root)
                video_path = _copy_local_video(local_video, video_dir) if args.copy_local_videos else local_video

            duration_s, native_fps, frame_count = _video_stats(video_path)
            video_id = f"{source_id}__{_safe_slug(video_path.stem)}"
            source_record: Dict[str, Any] = {
                "source_id": source_id,
                "source": raw_source,
                "title": row.title,
                "uploader": row.uploader,
                "declared_duration_seconds": row.duration_seconds,
                "license": row.license,
                "url": row.url,
                "local_path": row.local_path,
                "video_path": str(video_path),
                "video_duration_seconds": duration_s,
                "native_fps": native_fps,
                "native_frame_count": frame_count,
                "split": row.split,
                "protocol_id": row.protocol_id,
                "recipe": row.recipe,
                "step_hint": row.step_hint,
                "label_hint": row.label_hint,
                "query": row.query,
                "notes": row.notes,
            }
            sources_file.write(json.dumps(source_record, ensure_ascii=False) + "\n")

            windows = _build_clip_windows(
                duration_seconds=duration_s,
                clip_length_seconds=float(args.clip_length_seconds),
                clip_stride_seconds=float(args.clip_stride_seconds),
                minimum_clip_frames=int(args.minimum_clip_frames),
                target_fps=float(args.fps),
                clip_max_per_video=int(args.clip_max_per_video),
            )
            if not windows:
                raise RuntimeError(f"No sample windows were generated for {video_path}")

            for clip_idx, start_s, end_s in windows:
                sample_id = f"{video_id}__clip{clip_idx:04d}"
                start_ms = int(round(start_s * 1000.0))
                end_ms = int(round(end_s * 1000.0))
                clip_duration_s = max(0.0, end_s - start_s)

                if args.clip_length_seconds > 0:
                    clip_path = _write_clip_with_ffmpeg(
                        ffmpeg=ffmpeg,
                        video_path=video_path,
                        clip_path=clips_dir / f"{sample_id}.mp4",
                        start_seconds=start_s,
                        duration_seconds=clip_duration_s,
                    )
                    frame_video_path = clip_path
                    frame_timestamp_offset_ms = start_ms
                else:
                    clip_path = video_path
                    frame_video_path = video_path
                    frame_timestamp_offset_ms = 0

                sample_frames_dir = frames_dir / sample_id
                extracted = _extract_frames(
                    video_path=frame_video_path,
                    frames_dir=sample_frames_dir,
                    stem=sample_id,
                    fps=float(args.fps),
                    max_frames=int(args.max_frames),
                    jpeg_quality=int(args.jpeg_quality),
                    resize_max_side=int(args.resize_max_side),
                    timestamp_offset_ms=frame_timestamp_offset_ms,
                )
                if not extracted:
                    continue

                sample_record: Dict[str, Any] = {
                    "sample_id": sample_id,
                    "source_id": source_id,
                    "video_id": video_id,
                    "clip_path": str(clip_path),
                    "frames_dir": str(sample_frames_dir.resolve()),
                    "frame_count": len(extracted),
                    "clip_start_ms": start_ms,
                    "clip_end_ms": end_ms,
                    "clip_duration_seconds": clip_duration_s,
                    "target_fps": float(args.fps),
                }
                samples_file.write(json.dumps(sample_record, ensure_ascii=False) + "\n")

                for frame_index, (frame_ts_ms, frame_path) in enumerate(extracted):
                    frame_record = {
                        "frame_id": f"{sample_id}__frame{frame_index:04d}",
                        "sample_id": sample_id,
                        "source_id": source_id,
                        "frame_index": frame_index,
                        "image_path": str(frame_path),
                        "timestamp_ms": frame_ts_ms,
                    }
                    frames_file.write(json.dumps(frame_record, ensure_ascii=False) + "\n")

            print(f"[{idx + 1}/{len(rows)}] {video_path.name} -> {len(windows)} sample windows")

    print(f"Wrote source manifest -> {sources_manifest_path}")
    print(f"Wrote sample manifest -> {samples_manifest_path}")
    print(f"Wrote frame manifest  -> {frames_manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
