"""Shared judgment + protocol helpers for the training service."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from openlabos_training.session_manifest_io import resolve_protocol_id

ObjectId = Literal["mug", "kettle", "tea_bag", "spoon", "tray"]
ActionId = Literal["place", "pour", "add", "stir"]
SurfaceId = Literal["counter", "tray", "inside_mug"]
CriterionType = Literal[
    "object_on_surface",
    "liquid_in_object",
    "component_added",
    "stirred",
]
FailureType = Literal[
    "missing_object",
    "wrong_object",
    "wrong_surface",
    "spill",
    "sequence_error",
    "other",
]
JudgmentSchemaVersion = Literal["1"]


class SuccessCriterion(BaseModel):
    model_config = {"extra": "forbid"}

    criterion_type: CriterionType
    object_id: ObjectId | None = None
    related_object_id: ObjectId | None = None
    surface_id: SurfaceId | None = None
    description: str = Field(min_length=1)


class FailureMode(BaseModel):
    model_config = {"extra": "forbid"}

    failure_type: FailureType
    object_id: ObjectId | None = None
    description: str = Field(min_length=1)


class ExpectedObject(BaseModel):
    model_config = {"extra": "forbid"}

    object_id: ObjectId
    label: str = Field(min_length=1)


class ExpectedAction(BaseModel):
    model_config = {"extra": "forbid"}

    action_id: ActionId
    label: str = Field(min_length=1)
    target_object_id: ObjectId | None = None
    instrument_object_id: ObjectId | None = None


class ProtocolStep(BaseModel):
    model_config = {"extra": "forbid"}

    step_id: str = Field(min_length=1)
    order: int | None = Field(default=None, ge=0)
    title: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    expected_objects: list[ExpectedObject] = Field(min_length=1)
    expected_action: ExpectedAction
    success_criteria: list[SuccessCriterion] = Field(min_length=1)
    failure_modes: list[FailureMode]


class ProtocolDocument(BaseModel):
    model_config = {"extra": "forbid"}

    protocol_id: str = Field(min_length=1)
    protocol_version: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    steps: list[ProtocolStep] = Field(min_length=1)


class JudgmentResult(BaseModel):
    model_config = {"extra": "forbid"}

    step_id: str = Field(min_length=1)
    judgment_schema_version: JudgmentSchemaVersion | None = "1"
    objects_seen: list[ObjectId]
    action_detected: ActionId | None = None
    step_complete: bool
    possible_issue: FailureType | None = None
    confidence: float = Field(ge=0, le=1)
    reason: str


class MediaClipResponse(BaseModel):
    clip_id: str
    session_id: str
    capture_id: str
    step_id: str | None
    relative_path: str
    start_ms: int | None
    end_ms: int | None
    status: str
    created_at: datetime
    updated_at: datetime


class FrameSelectionError(RuntimeError):
    pass


class MediaPathError(ValueError):
    pass


class JudgmentParseError(ValueError):
    pass


_ACTION_IDS = frozenset({"place", "pour", "add", "stir"})
_ISSUE_IDS = frozenset(
    {"missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other"},
)


@dataclass(frozen=True)
class PromptParts:
    system: str
    user: str


def _format_validation_error(path: Path, exc: ValidationError) -> str:
    parts: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x != ())
        where = loc if loc else "(root)"
        parts.append(f"{where}: {err.get('msg', 'invalid')}")
    detail = "; ".join(parts) if parts else str(exc)
    return f"Protocol validation failed for {path}: {detail}"


def load_protocol_from_path(path: Path) -> ProtocolDocument:
    if not path.is_file():
        raise FileNotFoundError(f"Protocol file not found: {path}")
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"Cannot read protocol file {path}: {exc}") from exc
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Malformed JSON in protocol file {path}: {exc.msg} (line {exc.lineno}, column {exc.colno})",
        ) from exc
    try:
        return ProtocolDocument.model_validate(data)
    except ValidationError as exc:
        raise ValueError(_format_validation_error(path, exc)) from exc


class ProtocolRegistry:
    __slots__ = ("_by_id",)

    def __init__(self, protocols: dict[str, ProtocolDocument]) -> None:
        self._by_id = dict(protocols)

    @classmethod
    def from_single_path(cls, path: Path) -> ProtocolRegistry:
        doc = load_protocol_from_path(path)
        return cls({doc.protocol_id: doc})

    def get(self, protocol_id: str) -> ProtocolDocument | None:
        return self._by_id.get(protocol_id)


def max_frames() -> int:
    return int(os.environ.get("LABOS_JUDGMENT_MAX_FRAMES", "8"))


def parse_data_relative_path(rel: str) -> str:
    raw = rel.strip().replace("\\", "/")
    if not raw:
        raise MediaPathError("relative_path must be a non-empty string")
    parts = raw.split("/")
    if raw.startswith("/") or (len(parts) > 0 and parts[0].endswith(":")):
        raise MediaPathError("relative_path must be relative to data root (not absolute)")
    if any(part in ("..", "") for part in parts):
        raise MediaPathError("relative_path must not contain '..'")
    return raw


def resolve_data_path(data_root: Path, rel: str) -> Path:
    rel_norm = parse_data_relative_path(rel)
    abs_path = (data_root / Path(*rel_norm.split("/"))).resolve()
    root = data_root.resolve()
    try:
        abs_path.relative_to(root)
    except ValueError as exc:
        raise MediaPathError("relative_path escapes data root") from exc
    return abs_path


def select_frames_for_clip(*, data_root: Path, session_id: str, clip_id: str) -> list[str]:
    rel_dir = f"processed/{session_id}/frames/{clip_id}"
    try:
        abs_dir = resolve_data_path(data_root, rel_dir)
    except MediaPathError as exc:
        raise FrameSelectionError(str(exc)) from exc

    if not abs_dir.exists():
        raise FrameSelectionError(f"Frames directory missing: {rel_dir}")

    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = [p for p in abs_dir.glob("*") if p.is_file() and p.suffix.lower() in exts]
    files.sort(key=lambda p: p.name)

    picked = files[: max_frames()]
    if not picked:
        raise FrameSelectionError(f"No frame files found in {rel_dir}")
    return [p.relative_to(data_root.resolve()).as_posix() for p in picked]


def build_step_prompt(
    *,
    protocol: ProtocolDocument,
    step: ProtocolStep,
    frame_paths: list[str],
) -> PromptParts:
    system = (
        "You are a vision model for a closed-world kitchen protocol.\n"
        "Return STRICT JSON only. No markdown, no code fences, no extra keys.\n"
        "Structured fields are authoritative; `reason` is explanatory only.\n"
    )
    schema = {
        "step_id": "string",
        "judgment_schema_version": "string (optional)",
        "objects_seen": ["mug", "kettle", "tea_bag", "spoon", "tray"],
        "action_detected": ["place", "pour", "add", "stir", None],
        "step_complete": "boolean",
        "possible_issue": [
            "missing_object",
            "wrong_object",
            "wrong_surface",
            "spill",
            "sequence_error",
            "other",
            None,
        ],
        "confidence": "number 0..1",
        "reason": "string",
    }
    user = "\n".join(
        [
            f"Protocol: {protocol.name} ({protocol.protocol_id} v{protocol.protocol_version})",
            "",
            "Current step context:",
            f"- step_id: {step.step_id}",
            f"- title: {step.title}",
            f"- order: {step.order}",
            f"- instruction: {step.instruction}",
            f"- expected_action: {step.expected_action.action_id} ({step.expected_action.label})",
            f"- expected_objects: {', '.join(o.object_id for o in step.expected_objects)}",
            "",
            "Success criteria:",
            *[f"- {c.criterion_type}: {c.description}" for c in step.success_criteria],
            "",
            "Failure modes:",
            *[f"- {f.failure_type}: {f.description}" for f in step.failure_modes],
            "",
            "Frames provided (relative paths):",
            *[f"- {p}" for p in frame_paths],
            "",
            "Return JSON matching this schema exactly:",
            json.dumps(schema, indent=2),
        ],
    )
    return PromptParts(system=system, user=user)


def _first_allowed_enum_token(val: Any, allowed: frozenset[str]) -> str | None:
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        if s.lower() in ("null", "none", ""):
            return None
        return s if s in allowed else None
    if isinstance(val, list):
        for x in val:
            if x is None:
                continue
            if not isinstance(x, str):
                continue
            s = x.strip()
            if s.lower() in ("null", "none", ""):
                continue
            if s in allowed:
                return s
        return None
    return None


def normalize_judgment_dict(obj: dict[str, Any]) -> dict[str, Any]:
    o = dict(obj)
    jsv = o.get("judgment_schema_version", "1")
    if jsv in ("v1", "V1", 1, "1"):
        o["judgment_schema_version"] = "1"
    elif jsv is None:
        o["judgment_schema_version"] = "1"
    o["action_detected"] = _first_allowed_enum_token(o.get("action_detected"), _ACTION_IDS)
    o["possible_issue"] = _first_allowed_enum_token(o.get("possible_issue"), _ISSUE_IDS)
    return o


def parse_strict_json(text: str) -> dict[str, Any]:
    raw = text.strip()
    if not raw:
        raise JudgmentParseError("Empty model response")
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise JudgmentParseError("Model response did not contain a JSON object")
    chunk = raw[start : end + 1]
    try:
        obj = json.loads(chunk)
    except json.JSONDecodeError as exc:
        raise JudgmentParseError("Malformed JSON from model") from exc
    if not isinstance(obj, dict):
        raise JudgmentParseError("Model JSON must be an object")
    return obj


def validate_judgment(obj: dict[str, Any]) -> JudgmentResult:
    try:
        return JudgmentResult.model_validate(normalize_judgment_dict(obj))
    except ValidationError as exc:
        raise JudgmentParseError(f"Judgment JSON failed schema validation: {exc}") from exc


def protocol_id_for_session(
    conn: sqlite3.Connection,
    session_id: str,
    *,
    data_root: Path | None = None,
) -> str:
    return resolve_protocol_id(data_root=data_root, session_id=session_id, sqlite_conn=conn)


def get_clip(conn: sqlite3.Connection, *, clip_id: str) -> MediaClipResponse | None:
    row = conn.execute(
        """
        SELECT clip_id, session_id, capture_id, step_id, relative_path, start_ms, end_ms, status, created_at, updated_at
        FROM media_clips WHERE clip_id = ?
        """,
        (clip_id,),
    ).fetchone()
    if row is None:
        return None
    return MediaClipResponse(
        clip_id=row[0],
        session_id=row[1],
        capture_id=row[2],
        step_id=row[3],
        relative_path=row[4],
        start_ms=row[5],
        end_ms=row[6],
        status=row[7],
        created_at=datetime.fromisoformat(row[8]),
        updated_at=datetime.fromisoformat(row[9]),
    )


def session_step_exists(conn: sqlite3.Connection, *, session_id: str, step_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM session_steps WHERE session_id = ? AND step_id = ?",
        (session_id, step_id),
    ).fetchone()
    return row is not None


def insert_judgment(
    conn: sqlite3.Connection,
    *,
    session_id: str,
    clip_id: str,
    step_id: str,
    result: JudgmentResult,
    model_id: str | None,
    prompt_text: str | None,
    response_json: str | None,
) -> None:
    jid = str(uuid.uuid4())
    ts = datetime.now(UTC).replace(microsecond=0).isoformat()
    conn.execute(
        """
        INSERT INTO judgments (
            judgment_id, session_id, clip_id, step_id,
            judgment_schema_version, objects_seen_json, action_detected, step_complete,
            possible_issue, confidence, reason,
            model_id, prompt_text, response_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            jid,
            session_id,
            clip_id,
            step_id,
            result.judgment_schema_version,
            json.dumps(result.objects_seen),
            result.action_detected,
            1 if result.step_complete else 0,
            result.possible_issue,
            float(result.confidence),
            result.reason,
            model_id,
            prompt_text,
            response_json,
            ts,
        ),
    )
