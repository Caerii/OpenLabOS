"""
Build SFT JSONL for the clip-level step judgment task from a frozen TASK-0009 split.

At **prepare** time only: calls `build_step_prompt` + `select_frames_for_clip` from `labos_api` and
writes the **rendered** `system` / `user_text`, frame paths, and gold `target_json` into each row.
Training must consume those frozen strings and must **not** re-run the prompt builder (see
`train_judgment_sft.py`).

LM Studio serving still uses a different runtime stack than transformers training; see
`docs/runbooks/training.md`.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable


# TODO(openlabos): replace with read of generated openlabos_protocol JSON Schema types
# was: from labos_api.models.judgment import JudgmentResult
@dataclass
class JudgmentResult:
    """Stub mirroring labos_api.models.judgment.JudgmentResult.

    Was a Pydantic-ish model with model_dump(mode='json'). The OpenLabOS port should
    regenerate this from packages/protocol/schema/*.json via datamodel-code-generator
    (see scripts/regenerate-protocol-types.py).
    """

    step_id: str
    judgment_schema_version: str
    objects_seen: list[str]
    action_detected: str | None
    step_complete: bool
    possible_issue: str | None
    confidence: float
    reason: str

    def model_dump(self, *, mode: str = "python") -> dict[str, Any]:  # pragma: no cover - stub
        raise NotImplementedError(
            "TODO(openlabos): regenerate JudgmentResult from packages/protocol/schema; "
            "was labos_api.models.judgment.JudgmentResult.model_dump",
        )


# TODO(openlabos): replace with frame selection helper (lists processed/<session>/frames/<clip>/, sorts lexically, takes first N)
# was: from labos_api.services.frame_selection import FrameSelectionError, select_frames_for_clip
class FrameSelectionError(RuntimeError):
    """Stub for labos_api.services.frame_selection.FrameSelectionError."""


def select_frames_for_clip(*, data_root: Path, session_id: str, clip_id: str) -> list[str]:  # pragma: no cover - stub
    """Stub for labos_api.services.frame_selection.select_frames_for_clip."""
    raise NotImplementedError(
        "TODO(openlabos): port frame selection (sorted listing of "
        "processed/<session>/frames/<clip>/, first N images where N = LABOS_JUDGMENT_MAX_FRAMES); "
        "was labos_api.services.frame_selection.select_frames_for_clip",
    )


# TODO(openlabos): replace with prompt builder rendering protocol+step into a multimodal user/system prompt
# was: from labos_api.services.judgment_prompt import build_step_prompt
@dataclass
class _PromptParts:
    system: str
    user: str


def build_step_prompt(*, protocol: Any, step: Any, frame_paths: list[str]) -> _PromptParts:  # pragma: no cover - stub
    """Stub for labos_api.services.judgment_prompt.build_step_prompt."""
    raise NotImplementedError(
        "TODO(openlabos): port judgment prompt builder (renders protocol+step into "
        "system/user text aligned with the API inference contract); "
        "was labos_api.services.judgment_prompt.build_step_prompt",
    )


# TODO(openlabos): replace with protocol registry that loads protocol JSON files matching the new schema
# was: from labos_api.services.protocol_registry import ProtocolRegistry
class ProtocolRegistry:  # pragma: no cover - stub
    """Stub for labos_api.services.protocol_registry.ProtocolRegistry."""

    @classmethod
    def from_single_path(cls, path: Path) -> "ProtocolRegistry":
        raise NotImplementedError(
            "TODO(openlabos): port ProtocolRegistry (loads protocol JSON, exposes get(protocol_id) "
            "with .steps having .step_id); was labos_api.services.protocol_registry.ProtocolRegistry",
        )

    def get(self, protocol_id: str) -> Any:
        raise NotImplementedError(
            "TODO(openlabos): port ProtocolRegistry.get; was "
            "labos_api.services.protocol_registry.ProtocolRegistry.get",
        )


class JudgmentSftPrepareError(RuntimeError):
    pass


OBJECT_IDS = {"mug", "kettle", "tea_bag", "spoon", "tray"}
ACTION_IDS = {"place", "pour", "add", "stir"}
ISSUE_IDS = {"missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other"}


def repo_root_from_frozen_dir(frozen_dir: Path) -> Path | None:
    """
    Expect frozen_dir: <repo>/data/splits/<dataset>/<freeze_id>
    """
    p = frozen_dir.resolve()
    parts = p.parts
    if len(parts) < 4:
        return None
    if parts[-3] != "splits" or parts[-4] != "data":
        return None
    return p.parents[3]


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        raise JudgmentSftPrepareError(f"Split file not found: {path}")
    with path.open("r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise JudgmentSftPrepareError(f"Malformed JSON line {i} in {path}") from e
            if not isinstance(obj, dict):
                raise JudgmentSftPrepareError(f"Line {i} in {path} must be a JSON object")
            yield obj


def parse_label_row(obj: dict[str, Any]) -> dict[str, Any]:
    try:
        session_id = str(obj["session_id"])
        clip_id = str(obj["clip_id"])
        step_id = str(obj["step_id"])
    except KeyError as e:
        raise JudgmentSftPrepareError(f"Missing required key: {e}") from e

    objects = obj.get("objects_seen")
    if not isinstance(objects, list):
        raise JudgmentSftPrepareError("objects_seen must be an array")
    objects_seen = {str(x) for x in objects}
    if objects_seen - OBJECT_IDS:
        raise JudgmentSftPrepareError(f"objects_seen contains unknown ids: {sorted(objects_seen - OBJECT_IDS)}")

    action = obj.get("action_detected")
    action_detected = None if action is None else str(action)
    if action_detected is not None and action_detected not in ACTION_IDS:
        raise JudgmentSftPrepareError(f"action_detected unknown: {action_detected!r}")

    step_complete = bool(obj.get("step_complete") is True)

    issue = obj.get("possible_issue")
    possible_issue = None if issue is None else str(issue)
    if possible_issue is not None and possible_issue not in ISSUE_IDS:
        raise JudgmentSftPrepareError(f"possible_issue unknown: {possible_issue!r}")

    return {
        "session_id": session_id,
        "clip_id": clip_id,
        "step_id": step_id,
        "objects_seen": sorted(objects_seen),
        "action_detected": action_detected,
        "step_complete": step_complete,
        "possible_issue": possible_issue,
    }


def protocol_id_for_session(conn: sqlite3.Connection, session_id: str) -> str:
    row = conn.execute("SELECT protocol_id FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    if row is None:
        raise JudgmentSftPrepareError(f"No session row for session_id={session_id!r}")
    return str(row[0])


def build_target_json(label: dict[str, Any]) -> dict[str, Any]:
    """
    Structured judgment target aligned with `JudgmentResult` / TASK-0008 fields.

    `confidence=1.0` is an **SFT bookkeeping convention**, not a calibrated human confidence.
    """
    result = JudgmentResult(
        step_id=label["step_id"],
        judgment_schema_version="1",
        objects_seen=label["objects_seen"],
        action_detected=label["action_detected"],
        step_complete=label["step_complete"],
        possible_issue=label["possible_issue"],
        confidence=1.0,
        reason="Gold label from frozen dataset (structured fields authoritative).",
    )
    return result.model_dump(mode="json")


def materialize_split(
    *,
    split_path: Path,
    source_split: str,
    dataset_name: str,
    freeze_id: str,
    prompt_frozen_at: str,
    data_root: Path,
    registry: ProtocolRegistry,
    conn: sqlite3.Connection,
) -> list[dict[str, Any]]:
    """
    One JSONL line per frozen label row, **same order** as the split file (no reshuffle).
    Only reads the given split file; never reads ``test.jsonl``.
    """
    out_rows: list[dict[str, Any]] = []
    for obj in iter_jsonl(split_path):
        label = parse_label_row(obj)
        session_id = label["session_id"]
        clip_id = label["clip_id"]
        step_id = label["step_id"]

        protocol_id = protocol_id_for_session(conn, session_id=session_id)
        protocol = registry.get(protocol_id)
        if protocol is None:
            raise JudgmentSftPrepareError(f"Protocol {protocol_id!r} not loaded (check --protocol-path).")
        step = next((s for s in protocol.steps if s.step_id == step_id), None)
        if step is None:
            raise JudgmentSftPrepareError(f"step_id {step_id!r} not in protocol {protocol_id}")

        try:
            frame_rel_paths = select_frames_for_clip(data_root=data_root, session_id=session_id, clip_id=clip_id)
        except FrameSelectionError as e:
            raise JudgmentSftPrepareError(f"Frame selection failed clip_id={clip_id}: {e}") from e

        parts = build_step_prompt(protocol=protocol, step=step, frame_paths=frame_rel_paths)
        target_json = build_target_json(label)

        row_id = f"{protocol_id}/{clip_id}/{step_id}"
        out_rows.append(
            {
                "judgment_sft_row_schema_version": "1",
                "prompt_frozen_at": prompt_frozen_at,
                "dataset_name": dataset_name,
                "freeze_id": freeze_id,
                "source_split": source_split,
                "session_id": session_id,
                "clip_id": clip_id,
                "step_id": step_id,
                "protocol_id": protocol_id,
                "id": row_id,
                # Frozen rendered prompts (training consumes these only; do not re-run build_step_prompt).
                "system": parts.system,
                "user_text": parts.user,
                "image_rel_paths": frame_rel_paths,
                # Gold structured target: same object TASK-0008 scores (strict JSON in assistant turn).
                "target_json": target_json,
                "provenance": {
                    "split_file": str(split_path),
                    "session_id": session_id,
                    "clip_id": clip_id,
                    "step_id": step_id,
                    "protocol_id": protocol_id,
                },
            },
        )
    return out_rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Prepare judgment SFT JSONL from frozen train/val splits (TASK-0009 format).",
    )
    p.add_argument(
        "--frozen-dir",
        required=True,
        help="Frozen dataset directory: data/splits/<dataset>/<freeze_id>/",
    )
    p.add_argument("--sqlite", required=True, help="API SQLite DB (sessions -> protocol_id).")
    p.add_argument(
        "--data-root",
        default="",
        help="Repo data root (default: infer from frozen-dir or LABOS_DATA_ROOT).",
    )
    p.add_argument(
        "--protocol-path",
        default="",
        help="Protocol JSON (default: LABOS_PROTOCOL_PATH or monorepo packages/protocol-schema/examples/kitchen-tea-v1.json).",
    )
    p.add_argument(
        "--out-dir",
        required=True,
        help="Output directory (writes sft_train.jsonl, sft_val.jsonl if val exists, dataset-manifest.json).",
    )
    args = p.parse_args(argv)

    import os

    frozen_dir = Path(args.frozen_dir).resolve()
    train_split = frozen_dir / "train.jsonl"
    val_split = frozen_dir / "val.jsonl"
    if not train_split.exists():
        raise SystemExit(f"Missing train split: {train_split}")

    inferred_root = repo_root_from_frozen_dir(frozen_dir)
    data_root = Path(args.data_root).resolve() if args.data_root else None
    if data_root is None:
        env_root = os.environ.get("LABOS_DATA_ROOT")
        if env_root:
            data_root = Path(env_root).resolve()
        elif inferred_root is not None:
            data_root = inferred_root / "data"
        else:
            raise SystemExit(
                "Could not infer --data-root; pass explicitly or point --frozen-dir at .../data/splits/<d>/<f>.",
            )
    if not data_root.exists():
        raise SystemExit(f"data-root does not exist: {data_root}")

    if args.protocol_path:
        protocol_path = Path(args.protocol_path).resolve()
    else:
        env_proto = os.environ.get("LABOS_PROTOCOL_PATH")
        if env_proto:
            protocol_path = Path(env_proto).resolve()
        elif inferred_root is not None:
            protocol_path = (
                inferred_root / "packages" / "protocol-schema" / "examples" / "kitchen-tea-v1.json"
            )
        else:
            raise SystemExit("Could not infer protocol path; set --protocol-path or LABOS_PROTOCOL_PATH.")

    if not protocol_path.exists():
        raise SystemExit(f"Protocol file not found: {protocol_path}")

    sqlite_path = Path(args.sqlite).resolve()
    if not sqlite_path.exists():
        raise SystemExit(f"SQLite not found: {sqlite_path}")

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    freeze_id = frozen_dir.name
    dataset_name = frozen_dir.parent.name
    prompt_frozen_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    # TODO(openlabos): re-source labos_api package version once a Python protocol package exists; was importlib_metadata.version("labos-api")
    labos_api_version = "unknown"

    registry = ProtocolRegistry.from_single_path(protocol_path)
    conn = sqlite3.connect(str(sqlite_path))
    try:
        train_rows = materialize_split(
            split_path=train_split,
            source_split="train",
            dataset_name=dataset_name,
            freeze_id=freeze_id,
            prompt_frozen_at=prompt_frozen_at,
            data_root=data_root,
            registry=registry,
            conn=conn,
        )
        val_rows: list[dict[str, Any]] = []
        if val_split.exists():
            val_rows = materialize_split(
                split_path=val_split,
                source_split="val",
                dataset_name=dataset_name,
                freeze_id=freeze_id,
                prompt_frozen_at=prompt_frozen_at,
                data_root=data_root,
                registry=registry,
                conn=conn,
            )
    except JudgmentSftPrepareError as e:
        raise SystemExit(str(e)) from e
    finally:
        conn.close()

    train_out = out_dir / "sft_train.jsonl"
    val_out = out_dir / "sft_val.jsonl"
    write_jsonl(train_out, train_rows)
    if val_rows:
        write_jsonl(val_out, val_rows)

    small_train = len(train_rows) < 8
    manifest = {
        "task": "judgment_sft_prepare",
        "created_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "prompt_frozen_at": prompt_frozen_at,
        "judgment_sft_row_schema_version": "1",
        "dataset_name": dataset_name,
        "freeze_id": freeze_id,
        "frozen_dataset_dir": str(frozen_dir),
        "train_split_source": str(train_split),
        "val_split_source": str(val_split) if val_split.exists() else None,
        "test_split_excluded": (
            "test.jsonl is never read by prepare-judgment-sft; hold out test for TASK-0008 / TASK-0010 only."
        ),
        "split_universe_note": (
            "Rows are emitted in the same order as the source split JSONL; no reshuffle and no inference "
            "of clips outside that file."
        ),
        "data_root": str(data_root),
        "protocol_path": str(protocol_path),
        "sqlite_path": str(sqlite_path),
        "labos_api_package_version": labos_api_version,
        "frame_policy": (
            "Same as API: list processed/<session_id>/frames/<clip_id>/, sort by filename, "
            "first N frames where N = LABOS_JUDGMENT_MAX_FRAMES (default 8). "
            "Empty frame directories fail loudly (FrameSelectionError)."
        ),
        "target_fields_note": (
            "target_json matches JudgmentResult: objects_seen, action_detected, step_complete, "
            "possible_issue, step_id, judgment_schema_version, confidence (SFT convention=1.0, not calibrated), "
            "reason (explanatory). Same structured fields TASK-0008 evaluates."
        ),
        "counts": {"train": len(train_rows), "val": len(val_rows)},
        "small_train_warning": (
            "Train split has fewer than 8 examples: this mainly validates plumbing, not meaningful model improvement."
            if small_train
            else None
        ),
        "outputs": {
            "train_jsonl": str(train_out),
            "val_jsonl": str(val_out) if val_rows else None,
        },
    }
    (out_dir / "dataset-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote {len(train_rows)} train rows -> {train_out}")
    if val_rows:
        print(f"Wrote {len(val_rows)} val rows   -> {val_out}")
    if small_train:
        print("WARNING: train split is tiny (<8 rows); see dataset-manifest.json small_train_warning.")
    print(f"Wrote manifest -> {out_dir / 'dataset-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
