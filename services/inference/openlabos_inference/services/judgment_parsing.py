"""Strict JSON parsing + validation for model judgment outputs."""

from __future__ import annotations

import json

from pydantic import ValidationError

from openlabos_inference.models.judgment import JudgmentResult


class JudgmentParseError(ValueError):
    pass


_ACTION_IDS = frozenset({"place", "pour", "add", "stir"})
_ISSUE_IDS = frozenset(
    {"missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other"},
)


def _first_allowed_enum_token(val, allowed: frozenset[str]) -> str | None:
    """Pick the first closed-vocab token from a scalar or list; ignore null-ish placeholders."""
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


def normalize_judgment_dict(obj: dict) -> dict:
    """
    Best-effort fixes for common model sloppiness before strict ``JudgmentResult`` validation.

    Keeps the frozen JSON contract intact while avoiding brittle failures on single-value lists
    or schema version typos. Both LM Studio and HF inference use ``validate_judgment`` -> this runs
    for every judgment insert path.
    """
    o = dict(obj)

    jsv = o.get("judgment_schema_version", "1")
    if jsv in ("v1", "V1", 1, "1"):
        o["judgment_schema_version"] = "1"
    elif jsv is None:
        o["judgment_schema_version"] = "1"

    o["action_detected"] = _first_allowed_enum_token(o.get("action_detected"), _ACTION_IDS)
    o["possible_issue"] = _first_allowed_enum_token(o.get("possible_issue"), _ISSUE_IDS)

    return o


def parse_strict_json(text: str) -> dict:
    raw = text.strip()
    if not raw:
        raise JudgmentParseError("Empty model response")
    # Strict-by-contract, but tolerate accidental code fences by extracting the largest JSON object.
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise JudgmentParseError("Model response did not contain a JSON object")
    chunk = raw[start : end + 1]
    try:
        obj = json.loads(chunk)
    except json.JSONDecodeError as e:
        raise JudgmentParseError("Malformed JSON from model") from e
    if not isinstance(obj, dict):
        raise JudgmentParseError("Model JSON must be an object")
    return obj


def validate_judgment(obj: dict) -> JudgmentResult:
    try:
        return JudgmentResult.model_validate(normalize_judgment_dict(obj))
    except ValidationError as e:
        raise JudgmentParseError(f"Judgment JSON failed schema validation: {e}") from e
