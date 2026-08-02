"""Deterministic provider used for contract tests and offline integration."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class MockProvider:
    """Return a schema-shaped judgment without calling a model server."""

    async def render_judgment(self, request: dict[str, Any]) -> dict[str, Any]:
        step = request["step"]
        return {
            "judgment_id": str(uuid4()),
            "session_id": request["session_id"],
            "step_id": step["step_id"],
            "frame_uri": request.get("frame_uri") or "",
            "emitted_at": datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "source": "mock:deterministic",
            "provider": "mock",
            "model": "deterministic",
            "gateway_version": "openlabos-inference/0.2",
            "verdict": "indeterminate",
            "rationale": "Deterministic offline contract response; no model was called.",
            "criteria": [
                {
                    "criterion_index": index,
                    "satisfied": False,
                    "evidence": "Mock provider does not inspect evidence.",
                }
                for index, _criterion in enumerate(step.get("success_criteria", []))
            ],
            "observed_objects": [],
        }
