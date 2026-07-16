from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional


@dataclass(frozen=True)
class VerifyStepExample:
    run_id: str
    protocol_id: str
    step_number: int
    frame_ref: str
    reasoning: str
    success: bool
    confidence: float
    raw_response: Dict[str, Any]
    ts: int


def iter_jsonl(path: Path) -> Iterator[Dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


def extract_verify_step(events: Iterable[Dict[str, Any]]) -> List[VerifyStepExample]:
    out: List[VerifyStepExample] = []
    for evt in events:
        if evt.get("type") != "verify_step":
            continue
        payload = evt.get("payload") or {}
        v = payload.get("verification") or {}
        frame_ref = v.get("frameRef")
        if not frame_ref:
            continue
        out.append(
            VerifyStepExample(
                run_id=str(evt.get("runId") or ""),
                protocol_id=str(evt.get("protocolId") or ""),
                step_number=int(payload.get("stepNumber") or 0),
                frame_ref=str(frame_ref),
                reasoning=str(v.get("reasoning") or ""),
                success=bool(v.get("success") is True),
                confidence=float(v.get("confidence") or 0.0),
                raw_response=v.get("rawResponse") if isinstance(v.get("rawResponse"), dict) else {},
                ts=int(evt.get("ts") or 0),
            )
        )
    return out


def resolve_frame_path(labos_dashboard_root: Path, frame_ref: str) -> Path:
    # frame_ref is stored relative to dashboard/data, e.g. "kitchen/frames/....jpg"
    return (labos_dashboard_root / frame_ref).resolve()
