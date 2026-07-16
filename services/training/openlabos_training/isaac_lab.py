"""Isaac Lab bridge contracts for LabOS training artifacts.

This module intentionally does not import Isaac Lab. Isaac Lab is a heavy GPU
runtime built on Isaac Sim, so the training repo should emit stable task specs
that a RunPod/Isaac worker can consume later. Keeping this file pure Python makes
the export path testable on ordinary developer machines.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json


SCHEMA_VERSION = "labos.isaac_lab.task_spec.v1"


@dataclass(frozen=True)
class IsaacLabBridgePlan:
    """Human-readable plan for mapping LabOS artifacts into Isaac Lab."""

    task_family: str
    robot_target: str
    observation_sources: tuple[str, ...]
    reward_terms: tuple[str, ...]
    reset_conditions: tuple[str, ...]
    sim_to_real_notes: tuple[str, ...]


DEFAULT_KITCHEN_PLAN = IsaacLabBridgePlan(
    task_family="kitchen_protocol_adherence",
    robot_target="future_manipulator_or_cobot",
    observation_sources=(
        "LabOS protocol step ids",
        "egocentric RGB frames",
        "entity observations and tracks",
        "optional LabClaw hand/contact primitives",
        "optional B3D scene graph and object-pose uncertainty",
    ),
    reward_terms=(
        "positive reward for satisfying current step success criteria",
        "negative reward for missing required objects",
        "negative reward for unsafe or out-of-order actions",
        "shaping reward for reducing spatial error between object state and target state",
    ),
    reset_conditions=(
        "protocol completed",
        "blocked safety/deviation state",
        "maximum simulated episode length exceeded",
        "object leaves valid workspace bounds",
    ),
    sim_to_real_notes=(
        "Use real LabOS recordings as demonstrations and evaluation fixtures first.",
        "Use Isaac Lab for synthetic rollouts, counterfactuals, and future robot/cobot policies.",
        "Do not use simulated success alone as proof of real glasses adherence.",
    ),
)


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _step_records(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    protocol = manifest.get("protocol") if isinstance(manifest.get("protocol"), dict) else {}
    run = manifest.get("run") if isinstance(manifest.get("run"), dict) else {}
    raw_steps = _safe_list(protocol.get("steps")) or _safe_list(run.get("steps"))

    steps: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_steps, start=1):
        if not isinstance(raw, dict):
            continue
        step_id = str(raw.get("id") or raw.get("stepId") or raw.get("step_id") or f"step-{index}")
        instruction = str(raw.get("instruction") or raw.get("title") or raw.get("description") or step_id)
        required_objects = _safe_list(raw.get("requiredObjects")) or _safe_list(raw.get("objects"))
        success_criteria = raw.get("successCriteria") or raw.get("success_criteria") or ""
        steps.append(
            {
                "step_id": step_id,
                "order": int(raw.get("order") or raw.get("number") or index),
                "instruction": instruction,
                "required_objects": [str(item) for item in required_objects],
                "success_criteria": str(success_criteria),
            }
        )
    return steps


def build_task_spec(
    manifest: dict[str, Any],
    *,
    source_path: str | None = None,
    plan: IsaacLabBridgePlan = DEFAULT_KITCHEN_PLAN,
) -> dict[str, Any]:
    """Build a portable Isaac Lab task spec from a LabOS session manifest."""

    run = manifest.get("run") if isinstance(manifest.get("run"), dict) else {}
    protocol = manifest.get("protocol") if isinstance(manifest.get("protocol"), dict) else {}
    steps = _step_records(manifest)
    required_objects = sorted({obj for step in steps for obj in step["required_objects"]})

    return {
        "schema_version": SCHEMA_VERSION,
        "source": {
            "kind": "labos_session_manifest",
            "path": source_path,
            "run_id": run.get("id") or manifest.get("runId") or manifest.get("run_id"),
            "protocol_id": protocol.get("id") or run.get("protocolId") or manifest.get("protocolId"),
        },
        "isaac_lab": {
            "task_family": plan.task_family,
            "robot_target": plan.robot_target,
            "headless_default": True,
            "recommended_runtime": "RunPod GPU pod with Isaac Sim / Isaac Lab image",
        },
        "environment": {
            "workspace": "countertop_or_bench",
            "objects": required_objects,
            "steps": steps,
        },
        "observations": list(plan.observation_sources),
        "reward_terms": list(plan.reward_terms),
        "reset_conditions": list(plan.reset_conditions),
        "sim_to_real_notes": list(plan.sim_to_real_notes),
        "artifacts": {
            "expected_outputs": [
                "isaac_lab_task_spec.json",
                "rollout_manifest.json",
                "policy_checkpoint_or_behavior_clone_artifacts",
                "evaluation_report.json",
            ]
        },
    }


def load_manifest(path: Path) -> dict[str, Any]:
    """Read a LabOS session manifest JSON file."""

    return json.loads(path.read_text(encoding="utf-8"))


def write_task_spec(spec: dict[str, Any], path: Path) -> None:
    """Write a task spec as deterministic, inspectable JSON."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
