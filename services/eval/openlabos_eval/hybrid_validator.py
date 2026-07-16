from __future__ import annotations

import argparse
import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


HYBRID_SCHEMA_VERSION = "openlabos.contract.hybrid_judgments.v1"
HYBRID_RESPONSE_SCHEMA_VERSION = "contract_hybrid.v1"


class HybridValidationError(RuntimeError):
    """Raised when the hybrid judgment build cannot be completed."""


@dataclass(frozen=True)
class SplitRow:
    session_id: str
    clip_id: str
    step_id: str


@dataclass(frozen=True)
class StepConstraint:
    step_id: str
    expected_action: str | None
    allowed_issues: frozenset[str]
    expected_objects: frozenset[str]


@dataclass(frozen=True)
class JudgmentRow:
    judgment_id: str
    session_id: str
    clip_id: str
    step_id: str
    judgment_schema_version: str
    objects_seen: list[str]
    action_detected: str | None
    step_complete: bool
    possible_issue: str | None
    confidence: float
    reason: str
    model_id: str
    created_at: str


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _load_split(path: Path) -> list[SplitRow]:
    if not path.exists():
        raise HybridValidationError(f"Dataset split not found: {path}")

    rows: list[SplitRow] = []
    with path.open("r", encoding="utf-8-sig") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise HybridValidationError(f"{path}: line {line_no} invalid JSON: {e.msg}") from e
            try:
                rows.append(
                    SplitRow(
                        session_id=str(obj["session_id"]),
                        clip_id=str(obj["clip_id"]),
                        step_id=str(obj["step_id"]),
                    ),
                )
            except KeyError as e:
                raise HybridValidationError(f"{path}: line {line_no} missing required key {e}") from e
    if not rows:
        raise HybridValidationError(f"{path}: no rows")
    return rows


def _load_constraints(protocol_path: Path) -> dict[str, StepConstraint]:
    if not protocol_path.exists():
        raise HybridValidationError(f"Protocol JSON not found: {protocol_path}")

    try:
        data = json.loads(protocol_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise HybridValidationError(f"{protocol_path}: invalid JSON: {e.msg}") from e

    out: dict[str, StepConstraint] = {}
    for step in data.get("steps", []):
        step_id = str(step["step_id"])
        expected_action_obj = step.get("expected_action") or {}
        expected_action = expected_action_obj.get("action_id")
        allowed_issues = {
            str(fm.get("failure_type"))
            for fm in step.get("failure_modes", [])
            if fm.get("failure_type") is not None
        }
        expected_objects = {
            str(obj.get("object_id"))
            for obj in step.get("expected_objects", [])
            if obj.get("object_id") is not None
        }
        out[step_id] = StepConstraint(
            step_id=step_id,
            expected_action=str(expected_action) if expected_action is not None else None,
            allowed_issues=frozenset(allowed_issues),
            expected_objects=frozenset(expected_objects),
        )
    if not out:
        raise HybridValidationError(f"{protocol_path}: no protocol steps")
    return out


def _latest_judgments(
    conn: sqlite3.Connection,
    *,
    clip_ids: list[str],
    model_id: str,
) -> dict[str, JudgmentRow]:
    if not clip_ids:
        return {}

    q = ",".join(["?"] * len(clip_ids))
    rows = conn.execute(
        f"""
        SELECT
          judgment_id, session_id, clip_id, step_id, judgment_schema_version,
          objects_seen_json, action_detected, step_complete, possible_issue,
          confidence, reason, model_id, created_at
        FROM (
          SELECT
            j.*,
            ROW_NUMBER() OVER (
              PARTITION BY clip_id
              ORDER BY created_at DESC, judgment_id DESC
            ) AS rn
          FROM judgments j
          WHERE clip_id IN ({q})
            AND model_id = ?
        )
        WHERE rn = 1
        """,
        tuple(clip_ids) + (model_id,),
    ).fetchall()

    out: dict[str, JudgmentRow] = {}
    for r in rows:
        try:
            objects_seen = json.loads(r[5] or "[]")
        except json.JSONDecodeError:
            objects_seen = []
        if not isinstance(objects_seen, list):
            objects_seen = []
        clip_id = str(r[2])
        out[clip_id] = JudgmentRow(
            judgment_id=str(r[0]),
            session_id=str(r[1]),
            clip_id=clip_id,
            step_id=str(r[3]),
            judgment_schema_version=str(r[4] or "1"),
            objects_seen=[str(x) for x in objects_seen],
            action_detected=str(r[6]) if r[6] is not None else None,
            step_complete=bool(r[7]),
            possible_issue=str(r[8]) if r[8] is not None else None,
            confidence=float(r[9]),
            reason=str(r[10] or ""),
            model_id=str(r[11]),
            created_at=str(r[12]),
        )
    return out


def _choose_action(*, baseline: JudgmentRow, sft: JudgmentRow | None, constraint: StepConstraint) -> tuple[str | None, str]:
    if sft is not None and sft.action_detected == constraint.expected_action:
        return sft.action_detected, "sft_action_matches_expected_action"
    if baseline.action_detected == constraint.expected_action:
        return baseline.action_detected, "baseline_action_matches_expected_action"
    return baseline.action_detected, "baseline_action_fallback"


def _choose_issue(*, baseline: JudgmentRow, constraint: StepConstraint) -> tuple[str | None, str]:
    issue = baseline.possible_issue
    if issue is None:
        return None, "baseline_no_issue"
    if issue in constraint.allowed_issues:
        return issue, "baseline_issue_allowed_by_protocol"
    return None, "baseline_issue_dropped_not_protocol_failure_mode"


def _choose_step_complete(
    *,
    baseline: JudgmentRow,
    sft: JudgmentRow | None,
    chosen_issue: str | None,
    chosen_action: str | None,
    constraint: StepConstraint,
) -> tuple[bool, str]:
    if chosen_issue is not None:
        return False, "protocol_allowed_issue_forces_incomplete"
    if baseline.step_complete:
        return True, "baseline_complete_no_allowed_issue"
    if (
        sft is not None
        and sft.step_complete
        and chosen_action == constraint.expected_action
        and baseline.possible_issue not in constraint.allowed_issues
    ):
        return True, "sft_complete_expected_action_overrides_baseline_out_of_protocol_issue"
    return baseline.step_complete, "baseline_completion_fallback"


def _insert_hybrid(
    conn: sqlite3.Connection,
    *,
    row: SplitRow,
    model_id: str,
    objects_seen: list[str],
    action_detected: str | None,
    step_complete: bool,
    possible_issue: str | None,
    confidence: float,
    reason: str,
    response_json: dict[str, Any],
    created_at: str,
) -> str:
    judgment_id = str(uuid.uuid4())
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
            judgment_id,
            row.session_id,
            row.clip_id,
            row.step_id,
            "1",
            json.dumps(objects_seen),
            action_detected,
            1 if step_complete else 0,
            possible_issue,
            confidence,
            reason,
            model_id,
            None,
            json.dumps(response_json, sort_keys=True),
            created_at,
        ),
    )
    return judgment_id


def build_hybrid_judgments(
    *,
    dataset_path: Path,
    sqlite_path: Path,
    protocol_path: Path,
    baseline_model_id: str,
    sft_model_id: str,
    output_model_id: str,
    audit_path: Path,
    replace: bool = False,
) -> dict[str, Any]:
    dataset_path = Path(dataset_path).resolve()
    sqlite_path = Path(sqlite_path).resolve()
    protocol_path = Path(protocol_path).resolve()
    audit_path = Path(audit_path).resolve()

    if not sqlite_path.exists():
        raise HybridValidationError(f"SQLite DB not found: {sqlite_path}")

    split_rows = _load_split(dataset_path)
    constraints = _load_constraints(protocol_path)
    clip_ids = [r.clip_id for r in split_rows]

    created_at = _now_iso()
    audit_rows: list[dict[str, Any]] = []

    conn = sqlite3.connect(str(sqlite_path))
    try:
        baseline_by_clip = _latest_judgments(conn, clip_ids=clip_ids, model_id=baseline_model_id)
        sft_by_clip = _latest_judgments(conn, clip_ids=clip_ids, model_id=sft_model_id)

        missing_baseline = [r.clip_id for r in split_rows if r.clip_id not in baseline_by_clip]
        if missing_baseline:
            raise HybridValidationError(f"Missing baseline judgments for clips: {missing_baseline}")

        if replace:
            q = ",".join(["?"] * len(clip_ids))
            conn.execute(
                f"DELETE FROM judgments WHERE model_id = ? AND clip_id IN ({q})",
                (output_model_id, *clip_ids),
            )

        for split_row in split_rows:
            constraint = constraints.get(split_row.step_id)
            if constraint is None:
                raise HybridValidationError(f"Protocol has no step_id={split_row.step_id!r}")

            baseline = baseline_by_clip[split_row.clip_id]
            sft = sft_by_clip.get(split_row.clip_id)

            action, action_rule = _choose_action(baseline=baseline, sft=sft, constraint=constraint)
            issue, issue_rule = _choose_issue(baseline=baseline, constraint=constraint)
            complete, complete_rule = _choose_step_complete(
                baseline=baseline,
                sft=sft,
                chosen_issue=issue,
                chosen_action=action,
                constraint=constraint,
            )
            objects_seen = list(dict.fromkeys(baseline.objects_seen))
            confidence = round(min(0.99, max(0.0, baseline.confidence)), 4)
            reason = (
                "Protocol-constrained hybrid judgment: baseline visual grounding for objects/issues, "
                "SFT action when it matches the expected protocol action, and protocol failure-mode "
                "constraints for issue/completion routing."
            )
            response_json = {
                "hybrid_schema_version": HYBRID_RESPONSE_SCHEMA_VERSION,
                "baseline_model_id": baseline_model_id,
                "sft_model_id": sft_model_id,
                "rules": {
                    "objects_seen": "baseline_objects",
                    "action_detected": action_rule,
                    "possible_issue": issue_rule,
                    "step_complete": complete_rule,
                },
                "constraint": {
                    "expected_action": constraint.expected_action,
                    "allowed_issues": sorted(constraint.allowed_issues),
                    "expected_objects": sorted(constraint.expected_objects),
                },
                "source": {
                    "baseline": {
                        "judgment_id": baseline.judgment_id,
                        "objects_seen": baseline.objects_seen,
                        "action_detected": baseline.action_detected,
                        "step_complete": baseline.step_complete,
                        "possible_issue": baseline.possible_issue,
                    },
                    "sft": None
                    if sft is None
                    else {
                        "judgment_id": sft.judgment_id,
                        "objects_seen": sft.objects_seen,
                        "action_detected": sft.action_detected,
                        "step_complete": sft.step_complete,
                        "possible_issue": sft.possible_issue,
                    },
                },
                "result": {
                    "objects_seen": objects_seen,
                    "action_detected": action,
                    "step_complete": complete,
                    "possible_issue": issue,
                },
            }
            judgment_id = _insert_hybrid(
                conn,
                row=split_row,
                model_id=output_model_id,
                objects_seen=objects_seen,
                action_detected=action,
                step_complete=complete,
                possible_issue=issue,
                confidence=confidence,
                reason=reason,
                response_json=response_json,
                created_at=created_at,
            )
            audit_rows.append(
                {
                    "clip_id": split_row.clip_id,
                    "step_id": split_row.step_id,
                    "judgment_id": judgment_id,
                    **response_json,
                },
            )

        conn.commit()
    finally:
        conn.close()

    audit = {
        "schema_version": HYBRID_SCHEMA_VERSION,
        "created_at": created_at,
        "dataset": str(dataset_path),
        "sqlite": str(sqlite_path),
        "protocol": str(protocol_path),
        "baseline_model_id": baseline_model_id,
        "sft_model_id": sft_model_id,
        "output_model_id": output_model_id,
        "row_count": len(audit_rows),
        "rows": audit_rows,
    }
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    return {"output_model_id": output_model_id, "rows": len(audit_rows), "audit": str(audit_path)}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build protocol-constrained hybrid judgments for contract smoke eval.")
    p.add_argument("--dataset", required=True, help="Frozen split JSONL to process.")
    p.add_argument("--sqlite", required=True, help="SQLite DB containing baseline and SFT judgments.")
    p.add_argument("--protocol", required=True, help="Protocol JSON with expected actions/failure modes.")
    p.add_argument("--baseline-model-id", required=True)
    p.add_argument("--sft-model-id", required=True)
    p.add_argument("--output-model-id", required=True)
    p.add_argument("--audit-out", required=True)
    p.add_argument("--replace", action="store_true", help="Delete existing output-model-id rows for these clips first.")
    args = p.parse_args(argv)

    try:
        result = build_hybrid_judgments(
            dataset_path=Path(args.dataset),
            sqlite_path=Path(args.sqlite),
            protocol_path=Path(args.protocol),
            baseline_model_id=str(args.baseline_model_id),
            sft_model_id=str(args.sft_model_id),
            output_model_id=str(args.output_model_id),
            audit_path=Path(args.audit_out),
            replace=bool(args.replace),
        )
    except HybridValidationError as e:
        print(str(e))
        return 2

    print(json.dumps(result, indent=2))
    return 0
