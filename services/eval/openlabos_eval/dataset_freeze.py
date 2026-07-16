from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from openlabos_eval.judgment_eval import DatasetError, LabeledClip, parse_dataset


def _repo_root_from_here() -> Path:
    # services/eval/openlabos_eval -> services/eval -> services -> repo root
    return Path(__file__).resolve().parent.parent.parent.parent


def default_data_root() -> Path:
    return _repo_root_from_here() / "data"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def now_utc_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


@dataclass(frozen=True)
class CandidateClip:
    capture_id: str
    clip_id: str
    session_id: str
    protocol_id: str
    step_id: str | None
    start_ms: int | None
    end_ms: int | None
    clip_relative_path: str
    frames_relative_dir: str
    frame_count: int


def iter_candidate_clips(
    *,
    sqlite_path: Path,
    data_root: Path,
    only_generated: bool = True,
    require_step_id: bool = True,
    only_unjudged: bool = False,
) -> list[CandidateClip]:
    if not sqlite_path.exists():
        raise DatasetError(f"SQLite DB not found: {sqlite_path}")

    conn = sqlite3.connect(str(sqlite_path))
    try:
        where = []
        params: list[Any] = []
        if only_generated:
            where.append("mc.status = ?")
            params.append("generated")
        if require_step_id:
            where.append("mc.step_id IS NOT NULL")
        if only_unjudged:
            where.append(
                "NOT EXISTS (SELECT 1 FROM judgments j WHERE j.clip_id = mc.clip_id)",
            )
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""

        rows = conn.execute(
            f"""
            SELECT mc.clip_id, mc.session_id, s.protocol_id, mc.capture_id, mc.step_id, mc.relative_path, mc.start_ms, mc.end_ms
            FROM media_clips mc
            JOIN sessions s ON s.session_id = mc.session_id
            {where_sql}
            ORDER BY mc.session_id ASC, mc.start_ms ASC, mc.clip_id ASC
            """,
            tuple(params),
        ).fetchall()

        out: list[CandidateClip] = []
        root = data_root.resolve()
        for r in rows:
            clip_id = str(r[0])
            session_id = str(r[1])
            protocol_id = str(r[2])
            capture_id = str(r[3])
            step_id = str(r[4]) if r[4] is not None else None
            clip_rel = str(r[5]).replace("\\", "/").strip()
            start_ms = int(r[6]) if r[6] is not None else None
            end_ms = int(r[7]) if r[7] is not None else None

            frames_rel_dir = f"processed/{session_id}/frames/{clip_id}"
            frames_abs = (root / Path(frames_rel_dir)).resolve()
            frame_count = 0
            if frames_abs.exists():
                exts = {".jpg", ".jpeg", ".png", ".webp"}
                frame_count = sum(1 for p in frames_abs.glob("*") if p.is_file() and p.suffix.lower() in exts)

            out.append(
                CandidateClip(
                    capture_id=capture_id,
                    clip_id=clip_id,
                    session_id=session_id,
                    protocol_id=protocol_id,
                    step_id=step_id,
                    start_ms=start_ms,
                    end_ms=end_ms,
                    clip_relative_path=clip_rel,
                    frames_relative_dir=frames_rel_dir,
                    frame_count=frame_count,
                ),
            )
        return out
    finally:
        conn.close()


def write_candidates_jsonl(path: Path, rows: list[CandidateClip]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r in rows:
        lines.append(
            json.dumps(
                {
                    "capture_id": r.capture_id,
                    "clip_id": r.clip_id,
                    "session_id": r.session_id,
                    "protocol_id": r.protocol_id,
                    "step_id": r.step_id,
                    "start_ms": r.start_ms,
                    "end_ms": r.end_ms,
                    "clip_relative_path": r.clip_relative_path,
                    "frames_relative_dir": r.frames_relative_dir,
                    "frame_count": r.frame_count,
                },
                sort_keys=True,
            ),
        )
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def validate_split_files(
    *,
    train_path: Path,
    val_path: Path,
    test_path: Path,
) -> tuple[list[LabeledClip], list[LabeledClip], list[LabeledClip]]:
    train = parse_dataset(train_path)
    val = parse_dataset(val_path)
    test = parse_dataset(test_path)

    def ids(rows: list[LabeledClip]) -> set[str]:
        clip_ids = [r.clip_id for r in rows]
        seen: set[str] = set()
        dup: list[str] = []
        for c in clip_ids:
            if c in seen:
                dup.append(c)
            else:
                seen.add(c)
        if dup:
            raise DatasetError(f"Duplicate clip_id within split: {dup[:10]}")
        return set(clip_ids)

    t = ids(train)
    v = ids(val)
    s = ids(test)

    overlap_tv = sorted(t & v)
    overlap_ts = sorted(t & s)
    overlap_vs = sorted(v & s)
    if overlap_tv or overlap_ts or overlap_vs:
        raise DatasetError(
            f"Split overlap detected: "
            f"train∩val={len(overlap_tv)}, train∩test={len(overlap_ts)}, val∩test={len(overlap_vs)}",
        )
    return train, val, test


def validate_clips_exist_in_db(
    *,
    sqlite_path: Path,
    clip_ids: Iterable[str],
) -> None:
    if not sqlite_path.exists():
        raise DatasetError(f"SQLite DB not found: {sqlite_path}")
    conn = sqlite3.connect(str(sqlite_path))
    try:
        ids = list(dict.fromkeys(clip_ids))
        if not ids:
            return
        q = ",".join(["?"] * len(ids))
        rows = conn.execute(
            f"SELECT clip_id FROM media_clips WHERE clip_id IN ({q})",
            tuple(ids),
        ).fetchall()
        found = {str(r[0]) for r in rows}
        missing = sorted(set(ids) - found)
        if missing:
            raise DatasetError(f"{len(missing)} clip_id(s) not found in DB (first 10): {missing[:10]}")
    finally:
        conn.close()


@dataclass(frozen=True)
class FreezeResult:
    out_dir: Path
    manifest_path: Path


def freeze_dataset(
    *,
    dataset_name: str,
    freeze_id: str,
    train_path: Path,
    val_path: Path,
    test_path: Path,
    out_root: Path,
    sqlite_path: Path,
    strict_db_check: bool = True,
    notes: str | None = None,
    force: bool = False,
) -> FreezeResult:
    if not dataset_name.strip():
        raise DatasetError("dataset_name must be non-empty")
    if not freeze_id.strip():
        raise DatasetError("freeze_id must be non-empty")

    out_dir = out_root / dataset_name / freeze_id
    if out_dir.exists() and not force:
        raise DatasetError(f"Target frozen directory already exists: {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    train, val, test = validate_split_files(train_path=train_path, val_path=val_path, test_path=test_path)
    all_ids = [r.clip_id for r in (train + val + test)]
    if strict_db_check:
        validate_clips_exist_in_db(sqlite_path=sqlite_path, clip_ids=all_ids)

    dst_train = out_dir / "train.jsonl"
    dst_val = out_dir / "val.jsonl"
    dst_test = out_dir / "test.jsonl"

    shutil.copy2(train_path, dst_train)
    shutil.copy2(val_path, dst_val)
    shutil.copy2(test_path, dst_test)

    manifest = {
        "dataset_name": dataset_name,
        "freeze_id": freeze_id,
        "freeze_timestamp": now_utc_iso(),
        "dataset_schema_version": "1",
        "baseline_locked": False,
        "inputs": {
            "train_path": str(train_path),
            "val_path": str(val_path),
            "test_path": str(test_path),
            "sqlite_path": str(sqlite_path),
            "strict_db_check": bool(strict_db_check),
        },
        "counts": {
            "train": len(train),
            "val": len(val),
            "test": len(test),
            "total": len(train) + len(val) + len(test),
        },
        "hashes": {
            "train.jsonl": sha256_file(dst_train),
            "val.jsonl": sha256_file(dst_val),
            "test.jsonl": sha256_file(dst_test),
        },
        "notes": notes or "",
    }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return FreezeResult(out_dir=out_dir, manifest_path=manifest_path)
