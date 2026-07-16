"""
CLI: process a registered capture into fixed-duration clips + sampled frames.

Primary verification path for TASK-0006. Keeps everything local-only and synchronous.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import uuid
from pathlib import Path

from openlabos_inference.config import load_settings
from openlabos_inference.persistence.media_repository import (
    create_generated_clip,
    delete_clips_by_ids,
    get_capture,
    list_generated_clips_for_capture,
)
from openlabos_inference.services.media_processing import (
    ClipSpec,
    SamplingPolicy,
    derive_clip_relative_path,
    plan_fixed_chunk_processing,
    process_capture_to_clips_and_frames,
)
from openlabos_inference.storage.media_paths import resolve_data_path


_CLIP_NAMESPACE = uuid.UUID("8e214e1a-5b13-4b56-9c38-5c916e3bdb9d")


def _deterministic_clip_id(capture_id: str, spec: ClipSpec) -> str:
    return str(uuid.uuid5(_CLIP_NAMESPACE, f"{capture_id}:{spec.start_ms}:{spec.end_ms}"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture-id", required=True, help="capture_id from media_captures")
    parser.add_argument("--clip-duration-ms", type=int, default=5000)
    parser.add_argument("--frame-fps", type=float, default=1.0)
    parser.add_argument("--max-ms", type=int, default=None, help="Optional cap on processed duration")
    parser.add_argument("--overwrite", action="store_true", help="Allow overwriting clip/frame outputs if present")
    args = parser.parse_args(argv)

    _, sqlite_path, data_root = load_settings()
    conn = sqlite3.connect(str(sqlite_path))
    try:
        cap = get_capture(conn, capture_id=args.capture_id)
        if cap is None:
            print("Capture not found", file=sys.stderr)
            return 2

        capture_path = resolve_data_path(data_root, cap.relative_path)
        if not capture_path.exists():
            print(f"Capture file missing under data root: {cap.relative_path}", file=sys.stderr)
            return 2

        specs = plan_fixed_chunk_processing(
            capture_path=capture_path,
            clip_duration_ms=args.clip_duration_ms,
            max_ms=args.max_ms,
        )
        if not specs:
            print("No clips planned (duration is 0?)", file=sys.stderr)
            return 2

        existing = list_generated_clips_for_capture(conn, capture_id=cap.capture_id)
        if existing and not args.overwrite:
            print(
                f"Capture already processed ({len(existing)} generated clip row(s)); use --overwrite to regenerate",
                file=sys.stderr,
            )
            return 2
        if existing and args.overwrite:
            # Delete DB rows first, then remove their corresponding files/dirs.
            deleted = delete_clips_by_ids(conn, clip_ids=[c.clip_id for c in existing])
            conn.commit()
            for c in existing:
                clip_abs = resolve_data_path(data_root, c.relative_path)
                if clip_abs.exists():
                    clip_abs.unlink()
                frames_dir = resolve_data_path(data_root, f"processed/{cap.session_id}/frames/{c.clip_id}")
                if frames_dir.exists():
                    # directory removal is safe because frames are file-only
                    import shutil as _shutil

                    _shutil.rmtree(frames_dir)
            print(f"Overwrite: removed {deleted} existing generated clip row(s) and outputs")

        # Pre-choose ids so filenames are deterministic and id-driven across reruns.
        clip_ids_and_specs: list[tuple[str, ClipSpec]] = [(_deterministic_clip_id(cap.capture_id, s), s) for s in specs]

        policy = SamplingPolicy(clip_duration_ms=args.clip_duration_ms, frame_fps=args.frame_fps)
        process_capture_to_clips_and_frames(
            data_root=data_root,
            session_id=cap.session_id,
            capture_relative_path=cap.relative_path,
            clip_ids_and_specs=clip_ids_and_specs,
            policy=policy,
            overwrite=args.overwrite,
        )

        # Persist generated clips after filesystem work succeeds.
        for clip_id, spec in clip_ids_and_specs:
            clip_rel = derive_clip_relative_path(cap.session_id, clip_id)
            # Sanity: ensure output exists before inserting metadata.
            clip_abs = resolve_data_path(data_root, clip_rel)
            if not clip_abs.exists():
                print(f"Expected clip missing after processing: {clip_rel}", file=sys.stderr)
                return 2
            create_generated_clip(
                conn,
                clip_id=clip_id,
                session_id=cap.session_id,
                capture_id=cap.capture_id,
                relative_path=clip_rel,
                start_ms=spec.start_ms,
                end_ms=spec.end_ms,
            )

        conn.commit()
        print(f"OK: generated {len(clip_ids_and_specs)} clip(s) under processed/{cap.session_id}/")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
