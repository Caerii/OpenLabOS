"""
Load and validate protocol JSON from disk. Pure-ish helpers for startup and future tests.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from openlabos_inference.models.protocol import ProtocolDocument


def _format_validation_error(path: Path, exc: ValidationError) -> str:
    parts: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x != ())
        where = loc if loc else "(root)"
        parts.append(f"{where}: {err.get('msg', 'invalid')}")
    detail = "; ".join(parts) if parts else str(exc)
    return f"Protocol validation failed for {path}: {detail}"


def load_protocol_from_path(path: Path) -> ProtocolDocument:
    """
    Read path, parse JSON, validate into ProtocolDocument.

    Raises:
        FileNotFoundError: path does not exist or is not a file (message includes path).
        ValueError: unreadable file, malformed JSON (message says so and includes path),
            or Pydantic validation (message includes path and field paths).
    """
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
