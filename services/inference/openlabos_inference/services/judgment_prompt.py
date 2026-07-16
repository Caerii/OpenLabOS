"""Explicit prompt construction for step judgments (inspectable plain text)."""

from __future__ import annotations

import json
from dataclasses import dataclass

from openlabos_inference.models.protocol import ProtocolDocument, ProtocolStep


@dataclass(frozen=True)
class PromptParts:
    system: str
    user: str


def build_step_prompt(
    *,
    protocol: ProtocolDocument,
    step: ProtocolStep,
    frame_paths: list[str],
) -> PromptParts:
    """
    Returns system + user strings for a chat completion.
    Frame paths are included as plain text references for auditability, even though the model receives images separately.
    """
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
            f"- expected_objects: {', '.join([o.object_id for o in step.expected_objects])}",
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
