from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


OBJECT_IDS = {"mug", "kettle", "tea_bag", "spoon", "tray"}
ACTION_IDS = {"place", "pour", "add", "stir"}
ISSUE_IDS = {"missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other"}


class DatasetError(ValueError):
    pass


@dataclass(frozen=True)
class LabeledClip:
    session_id: str
    clip_id: str
    step_id: str
    objects_seen: set[str]
    action_detected: str | None
    step_complete: bool
    possible_issue: str | None


@dataclass(frozen=True)
class PredictedClip:
    clip_id: str
    step_id: str
    objects_seen: set[str]
    action_detected: str | None
    step_complete: bool
    possible_issue: str | None


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        raise DatasetError(f"Dataset file not found: {path}")
    # Be forgiving: Windows tools sometimes write a UTF-8 BOM.
    with path.open("r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise DatasetError(f"Malformed JSON on line {i}") from e
            if not isinstance(obj, dict):
                raise DatasetError(f"Line {i} must be a JSON object")
            yield obj


def parse_dataset(path: Path) -> list[LabeledClip]:
    rows: list[LabeledClip] = []
    for obj in iter_jsonl(path):
        try:
            session_id = str(obj["session_id"])
            clip_id = str(obj["clip_id"])
            step_id = str(obj["step_id"])
        except KeyError as e:
            raise DatasetError(f"Missing required key: {e}") from e

        objects = obj.get("objects_seen")
        if not isinstance(objects, list):
            raise DatasetError("objects_seen must be an array")
        objects_seen = {str(x) for x in objects}
        bad = sorted(objects_seen - OBJECT_IDS)
        if bad:
            raise DatasetError(f"objects_seen contains unknown ids: {bad}")

        action = obj.get("action_detected")
        action_detected = None if action is None else str(action)
        if action_detected is not None and action_detected not in ACTION_IDS:
            raise DatasetError(f"action_detected unknown: {action_detected!r}")

        step_complete = bool(obj.get("step_complete") is True)

        issue = obj.get("possible_issue")
        possible_issue = None if issue is None else str(issue)
        if possible_issue is not None and possible_issue not in ISSUE_IDS:
            raise DatasetError(f"possible_issue unknown: {possible_issue!r}")

        rows.append(
            LabeledClip(
                session_id=session_id,
                clip_id=clip_id,
                step_id=step_id,
                objects_seen=objects_seen,
                action_detected=action_detected,
                step_complete=step_complete,
                possible_issue=possible_issue,
            ),
        )
    if not rows:
        raise DatasetError("Dataset is empty")
    return rows


def load_latest_predictions(
    conn: sqlite3.Connection,
    clip_ids: list[str],
    *,
    required_model_id: str | None = None,
) -> dict[str, PredictedClip]:
    """
    One prediction per clip: latest created_at wins, tie-break by judgment_id DESC.
    Missing clip_id => missing judgment (counts against validity rate).
    """
    if not clip_ids:
        return {}
    q = ",".join(["?"] * len(clip_ids))
    where_model = "AND model_id = ?" if required_model_id is not None else ""
    args: tuple = tuple(clip_ids) + ((required_model_id,) if required_model_id is not None else tuple())
    rows = conn.execute(
        f"""
        SELECT clip_id, step_id, objects_seen_json, action_detected, step_complete, possible_issue, created_at, judgment_id
        FROM (
          SELECT
            j.*,
            ROW_NUMBER() OVER (
              PARTITION BY clip_id
              ORDER BY created_at DESC, judgment_id DESC
            ) AS rn
          FROM judgments j
          WHERE clip_id IN ({q})
          {where_model}
        )
        WHERE rn = 1
        """,
        args,
    ).fetchall()
    out: dict[str, PredictedClip] = {}
    for r in rows:
        clip_id = str(r[0])
        try:
            objs = json.loads(r[2] or "[]")
        except json.JSONDecodeError:
            # Stored row is malformed; treat as missing/invalid and keep it in the denominator.
            continue
        if not isinstance(objs, list):
            continue
        objects_seen = {str(x) for x in objs}
        if objects_seen - OBJECT_IDS:
            continue

        action = str(r[3]) if r[3] is not None else None
        if action is not None and action not in ACTION_IDS:
            continue

        issue = str(r[5]) if r[5] is not None else None
        if issue is not None and issue not in ISSUE_IDS:
            continue

        out[clip_id] = PredictedClip(
            clip_id=clip_id,
            step_id=str(r[1]),
            objects_seen=objects_seen,
            action_detected=action,
            step_complete=bool(r[4]),
            possible_issue=issue,
        )
    return out


def _prf(tp: int, fp: int, fn: int) -> dict[str, float]:
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    return {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}


def compute_metrics(labels: list[LabeledClip], preds: dict[str, PredictedClip]) -> dict[str, Any]:
    n = len(labels)

    found = 0
    obj_tp = obj_fp = obj_fn = 0
    step_correct = 0
    action_correct = 0

    issue_tp = issue_fp = issue_fn = 0

    mismatches: list[dict[str, Any]] = []

    for lab in labels:
        pred = preds.get(lab.clip_id)
        if pred is None:
            mismatches.append({"clip_id": lab.clip_id, "missing_judgment": True})
            continue
        found += 1

        # Objects as set
        tp = len(lab.objects_seen & pred.objects_seen)
        fp = len(pred.objects_seen - lab.objects_seen)
        fn = len(lab.objects_seen - pred.objects_seen)
        obj_tp += tp
        obj_fp += fp
        obj_fn += fn

        if pred.step_complete == lab.step_complete:
            step_correct += 1

        if pred.action_detected == lab.action_detected:
            action_correct += 1

        # Issue detection: treat any non-null issue as positive.
        lab_pos = lab.possible_issue is not None
        pred_pos = pred.possible_issue is not None
        if lab_pos and pred_pos:
            if pred.possible_issue == lab.possible_issue:
                issue_tp += 1
            else:
                # wrong issue type: count as FP and FN (missed the correct one, predicted a different one)
                issue_fp += 1
                issue_fn += 1
        elif (not lab_pos) and pred_pos:
            issue_fp += 1
        elif lab_pos and (not pred_pos):
            issue_fn += 1

        # Minimal mismatch reporting
        if (
            fp
            or fn
            or pred.step_complete != lab.step_complete
            or pred.action_detected != lab.action_detected
            or pred.possible_issue != lab.possible_issue
        ):
            pred_set = sorted(pred.objects_seen)
            gold_set = sorted(lab.objects_seen)
            mismatches.append(
                {
                    "clip_id": lab.clip_id,
                    "step_id": lab.step_id,
                    "pred_step_id": pred.step_id,
                    "objects_gold": gold_set,
                    "objects_pred": pred_set,
                    "objects_exact_match": pred_set == gold_set,
                    "objects_fp": sorted(pred.objects_seen - lab.objects_seen),
                    "objects_fn": sorted(lab.objects_seen - pred.objects_seen),
                    "step_complete_gold": lab.step_complete,
                    "step_complete_pred": pred.step_complete,
                    "action_gold": lab.action_detected,
                    "action_pred": pred.action_detected,
                    "issue_gold": lab.possible_issue,
                    "issue_pred": pred.possible_issue,
                },
            )

    return {
        "counts": {
            "labeled_clips": n,
            "judgments_found": found,
            "missing_or_invalid_judgments": n - found,
        },
        "metrics": {
            # This is effectively "schema-valid judgment coverage" since predictions are sourced from SQLite.
            "judgment_coverage_rate": round(found / n, 4),
            "objects_micro": _prf(obj_tp, obj_fp, obj_fn),
            "step_complete_accuracy": round(step_correct / n, 4),
            "action_detected_accuracy": round(action_correct / n, 4),
            "issue_detection": _prf(issue_tp, issue_fp, issue_fn),
        },
        "mismatches": mismatches[:200],
    }
