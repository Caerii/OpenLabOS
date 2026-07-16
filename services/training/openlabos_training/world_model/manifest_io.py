from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


@dataclass(frozen=True)
class ResolvedMediaRef:
    ref: str
    kind: str
    local_path: Optional[Path]
    exists: bool


@dataclass(frozen=True)
class ManifestEpisode:
    path: Path
    manifest: Dict[str, Any]
    run_id: str
    protocol_id: str
    protocol_name: str


def load_manifest(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Manifest root must be an object: {path}")
    return data


def iter_manifest_files(manifest_dir: Path) -> List[Path]:
    return sorted(manifest_dir.glob("*.json"), key=lambda p: p.name)


def episode_from_path(path: Path) -> ManifestEpisode:
    manifest = load_manifest(path)
    run = manifest.get("run") or {}
    run_id = str(run.get("id") or path.stem)
    protocol_id = str(run.get("protocolId") or "unknown")
    protocol_name = str(run.get("protocolName") or protocol_id)
    return ManifestEpisode(
        path=path,
        manifest=manifest,
        run_id=run_id,
        protocol_id=protocol_id,
        protocol_name=protocol_name,
    )


def safe_resolve_data_ref(data_root: Path, ref: str) -> Path:
    root = data_root.resolve()
    resolved = (root / ref).resolve()
    relative = resolved.relative_to(root)
    if relative.parts and relative.parts[0] == "..":
        raise ValueError(f"Ref escapes data root: {ref}")
    return resolved


def resolve_frame_ref(data_root: Optional[Path], frame_ref: str) -> ResolvedMediaRef:
    if not data_root:
        return ResolvedMediaRef(ref=frame_ref, kind="frame", local_path=None, exists=False)
    try:
        local = safe_resolve_data_ref(data_root, frame_ref)
    except ValueError:
        return ResolvedMediaRef(ref=frame_ref, kind="frame", local_path=None, exists=False)
    return ResolvedMediaRef(ref=frame_ref, kind="frame", local_path=local, exists=local.is_file())


def resolve_chunk_ref(data_root: Optional[Path], chunk_ref: str) -> ResolvedMediaRef:
    if not data_root:
        return ResolvedMediaRef(ref=chunk_ref, kind="chunk", local_path=None, exists=False)
    try:
        local = safe_resolve_data_ref(data_root, chunk_ref)
    except ValueError:
        return ResolvedMediaRef(ref=chunk_ref, kind="chunk", local_path=None, exists=False)
    return ResolvedMediaRef(ref=chunk_ref, kind="chunk", local_path=local, exists=local.is_file())


def collect_media_refs(manifest: Dict[str, Any], data_root: Optional[Path]) -> Tuple[List[ResolvedMediaRef], List[ResolvedMediaRef]]:
    frames: List[ResolvedMediaRef] = []
    chunks: List[ResolvedMediaRef] = []
    seen_frames: set[str] = set()
    seen_chunks: set[str] = set()

    for entry in manifest.get("frames") or []:
        if not isinstance(entry, dict):
            continue
        ref = entry.get("frameRef")
        if not isinstance(ref, str) or not ref or ref in seen_frames:
            continue
        seen_frames.add(ref)
        frames.append(resolve_frame_ref(data_root, ref))

    for entry in manifest.get("chunks") or []:
        if not isinstance(entry, dict):
            continue
        for key, kind in (("chunkRef", "chunk"), ("indexRef", "chunk_index")):
            ref = entry.get(key)
            if not isinstance(ref, str) or not ref:
                continue
            dedupe = f"{kind}:{ref}"
            if dedupe in seen_chunks:
                continue
            seen_chunks.add(dedupe)
            resolved = resolve_chunk_ref(data_root, ref)
            chunks.append(
                ResolvedMediaRef(
                    ref=ref,
                    kind=kind,
                    local_path=resolved.local_path,
                    exists=resolved.exists,
                ),
            )

    return frames, chunks


def manifest_join_integrity(manifest: Dict[str, Any]) -> Dict[str, Any]:
    issues: List[str] = []
    run = manifest.get("run") or {}
    if not run.get("id"):
        issues.append("missing run.id")
    if not run.get("protocolId"):
        issues.append("missing run.protocolId")
    if manifest.get("schemaVersion") != "labos.kitchen.session-manifest.v1":
        issues.append("unexpected schemaVersion")
    segments = manifest.get("stepSegments") or []
    if not segments:
        issues.append("no stepSegments")
    for segment in segments:
        if not isinstance(segment, dict):
            issues.append("invalid stepSegment entry")
            continue
        if not segment.get("id"):
            issues.append("stepSegment missing id")
        if not segment.get("stepNumber"):
            issues.append(f"stepSegment {segment.get('id')} missing stepNumber")

    export_hints = manifest.get("exportHints") or {}
    stable_keys = export_hints.get("stableJoinKeys") or []
    expected = {
        "run.id",
        "run.protocolId",
        "steps.number",
        "stepAttempts.attemptId",
        "stepSegments.id",
        "frames.frameRef",
    }
    missing_keys = sorted(expected - set(stable_keys))
    if missing_keys:
        issues.append(f"exportHints missing join keys: {', '.join(missing_keys)}")

    return {
        "ok": len(issues) == 0,
        "issueCount": len(issues),
        "issues": issues,
    }


def media_coverage(frames: List[ResolvedMediaRef], chunks: List[ResolvedMediaRef]) -> Dict[str, Any]:
    frame_total = len(frames)
    chunk_total = len(chunks)
    frame_present = sum(1 for item in frames if item.exists)
    chunk_present = sum(1 for item in chunks if item.exists)
    denom = frame_total + chunk_total
    present = frame_present + chunk_present
    rate = (present / denom) if denom else None
    return {
        "frameTotal": frame_total,
        "framePresent": frame_present,
        "chunkTotal": chunk_total,
        "chunkPresent": chunk_present,
        "mediaCoverageRate": rate,
    }
