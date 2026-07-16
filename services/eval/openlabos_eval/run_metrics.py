from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from openlabos_eval.judgment_eval import compute_metrics as compute_judgment_metrics
from openlabos_eval.judgment_eval import load_latest_predictions, parse_dataset
from openlabos_eval.judgment_eval import DatasetError
from openlabos_eval.dataset_freeze import (
    DatasetError as FreezeDatasetError,
    default_data_root,
    freeze_dataset,
    iter_candidate_clips,
    validate_clips_exist_in_db,
    validate_split_files,
    write_candidates_jsonl,
)
from openlabos_eval.baseline_run import BaselineError, run_baseline


@dataclass(frozen=True)
class VerificationRow:
    run_id: str
    protocol_id: str
    step_number: int
    success: bool
    confidence: float
    has_frame_ref: bool
    has_reasoning: bool
    json_valid: bool


def _iter_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
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
                # Skip malformed lines; count elsewhere if needed
                continue


def _safe_bool(x: Any) -> bool:
    return bool(x is True)


def _safe_float(x: Any) -> float:
    try:
        return float(x)
    except Exception:
        return 0.0


def extract_verifications(events: Iterable[Dict[str, Any]]) -> List[VerificationRow]:
    rows: List[VerificationRow] = []
    for evt in events:
        if evt.get("type") != "verify_step":
            continue

        run_id = evt.get("runId") or ""
        protocol_id = evt.get("protocolId") or ""
        payload = evt.get("payload") or {}
        step_number = int(payload.get("stepNumber") or 0)
        v = payload.get("verification") or {}

        # This comes from the dashboard server; if it's missing, it probably means parsing failed upstream.
        json_valid = not bool(v.get("rawResponse", {}).get("parseError")) if isinstance(v.get("rawResponse"), dict) else True

        rows.append(
            VerificationRow(
                run_id=run_id,
                protocol_id=protocol_id,
                step_number=step_number,
                success=_safe_bool(v.get("success")),
                confidence=_safe_float(v.get("confidence")),
                has_frame_ref=bool(v.get("frameRef")),
                has_reasoning=bool(v.get("reasoning")),
                json_valid=json_valid,
            )
        )
    return rows


def compute_metrics(rows: List[VerificationRow], confidence_threshold: float = 0.6) -> Dict[str, Any]:
    n = len(rows)
    if n == 0:
        return {
            "counts": {"verifications": 0},
            "metrics": {},
        }

    json_valid_rate = sum(1 for r in rows if r.json_valid) / n
    has_frame_rate = sum(1 for r in rows if r.has_frame_ref) / n
    has_reasoning_rate = sum(1 for r in rows if r.has_reasoning) / n

    # NOTE: without ground truth labels, we can't compute accuracy. For the demo bar, you can
    # add a small human-labeled file later. For now, we compute "auto-advance rate" which matches
    # the tracker logic: success && confidence>=threshold.
    auto_advance_rate = sum(1 for r in rows if r.success and r.confidence >= confidence_threshold) / n

    return {
        "counts": {"verifications": n},
        "metrics": {
            "json_validity_rate": round(json_valid_rate, 4),
            "has_frame_ref_rate": round(has_frame_rate, 4),
            "has_reasoning_rate": round(has_reasoning_rate, 4),
            "auto_advance_rate": round(auto_advance_rate, 4),
            "confidence_threshold": confidence_threshold,
        },
    }


def write_report(report_dir: Path, report: Dict[str, Any]) -> Tuple[Path, Path]:
    report_dir.mkdir(parents=True, exist_ok=True)
    out_json = report_dir / "kitchen-run-metrics.json"
    out_md = report_dir / "kitchen-run-metrics.md"

    out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    md = []
    md.append("# Kitchen run metrics\n")
    md.append("\n## Summary\n")
    counts = report.get("counts", {})
    metrics = report.get("metrics", {})
    md.append(f"- verifications: **{counts.get('verifications', 0)}**\n")
    if metrics:
        md.append(f"- json_validity_rate: **{metrics.get('json_validity_rate')}**\n")
        md.append(f"- has_frame_ref_rate: **{metrics.get('has_frame_ref_rate')}**\n")
        md.append(f"- has_reasoning_rate: **{metrics.get('has_reasoning_rate')}**\n")
        md.append(f"- auto_advance_rate: **{metrics.get('auto_advance_rate')}** (threshold={metrics.get('confidence_threshold')})\n")

    out_md.write_text("".join(md), encoding="utf-8")
    return out_json, out_md


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Compute demo-grade metrics for OpenLabOS.")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_events = sub.add_parser("dashboard-events", help="Legacy: metrics from OpenLabOS run_events.jsonl")
    p_events.add_argument("--events", required=True, help="Path to run_events.jsonl")
    p_events.add_argument("--out", required=True, help="Output directory for reports (e.g. docs/eval/baseline-YYYYMMDD)")
    p_events.add_argument("--confidence-threshold", type=float, default=0.6)

    p_j = sub.add_parser("judgments", help="Evaluate stored judgments against frozen labeled dataset JSONL")
    p_j.add_argument("--dataset", required=True, help="Path to labeled dataset JSONL (see docs/eval/dataset-spec.md)")
    p_j.add_argument("--sqlite", required=True, help="Path to API SQLite DB (services/api/var/openlabos_sessions.sqlite)")
    p_j.add_argument("--out", required=True, help="Output directory for reports (e.g. docs/eval/baseline-YYYYMMDD)")
    p_j.add_argument(
        "--required-model-id",
        required=False,
        default=None,
        help="If set, evaluate using only SQLite judgments with this model_id (avoids latest-row footgun).",
    )

    p_hybrid = sub.add_parser(
        "hybrid-judgments",
        help="Build protocol-constrained hybrid judgments from two stored judgment model ids",
    )
    p_hybrid.add_argument("--dataset", required=True, help="Frozen split JSONL to process")
    p_hybrid.add_argument("--sqlite", required=True, help="SQLite DB containing baseline and SFT judgments")
    p_hybrid.add_argument("--protocol", required=True, help="Protocol JSON with expected actions/failure modes")
    p_hybrid.add_argument("--baseline-model-id", required=True)
    p_hybrid.add_argument("--sft-model-id", required=True)
    p_hybrid.add_argument("--output-model-id", required=True)
    p_hybrid.add_argument("--audit-out", required=True, help="Output JSON audit path")
    p_hybrid.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing output-model-id rows for these clips first",
    )

    p_ds = sub.add_parser("dataset", help="Dataset workflow: export candidates, validate labels, freeze splits")
    ds_sub = p_ds.add_subparsers(dest="ds_cmd", required=True)

    p_exp = ds_sub.add_parser("export-candidates", help="Export deterministic clip candidates for labeling")
    p_exp.add_argument("--sqlite", required=True, help="Path to API SQLite DB")
    p_exp.add_argument("--dataset-name", required=True)
    p_exp.add_argument(
        "--out",
        required=False,
        help="Output JSONL path (default: data/labels/candidates/<dataset_name>/candidates.jsonl)",
    )
    p_exp.add_argument("--data-root", required=False, help="Data root (default: repo data/)")
    p_exp.add_argument("--include-judged", action="store_true", help="Include clips that already have judgments")
    p_exp.add_argument("--include-missing-step", action="store_true", help="Include clips with null step_id")

    p_val = ds_sub.add_parser("validate", help="Validate split JSONLs (schema, vocab, overlap, DB existence)")
    p_val.add_argument("--sqlite", required=True, help="Path to API SQLite DB")
    p_val.add_argument("--train", required=True)
    p_val.add_argument("--val", required=True)
    p_val.add_argument("--test", required=True)
    p_val.add_argument("--no-db-check", action="store_true", help="Disable clip existence checks against SQLite")

    p_freeze = ds_sub.add_parser("freeze", help="Freeze train/val/test into data/splits/<dataset>/<freeze_id>/")
    p_freeze.add_argument("--sqlite", required=True, help="Path to API SQLite DB")
    p_freeze.add_argument("--dataset-name", required=True)
    p_freeze.add_argument("--freeze-id", required=True, help="Use <YYYYMMDD>-<slug>")
    p_freeze.add_argument("--train", required=True)
    p_freeze.add_argument("--val", required=True)
    p_freeze.add_argument("--test", required=True)
    p_freeze.add_argument("--notes", required=False, default="")
    p_freeze.add_argument("--force", action="store_true", help="Allow overwriting an existing frozen directory")
    p_freeze.add_argument("--no-db-check", action="store_true", help="Disable clip existence checks against SQLite")

    p_base = sub.add_parser("baseline", help="Baseline packaging for a frozen dataset split")
    p_base.add_argument(
        "--dataset-dir",
        required=True,
        help="Path to frozen dataset dir (data/splits/<dataset>/<freeze_id>/)",
    )
    p_base.add_argument("--split", default="test", help="Split name to evaluate (train|val|test). Default: test")
    p_base.add_argument("--sqlite", required=True, help="Path to API SQLite DB")
    p_base.add_argument(
        "--report-root",
        default="reports/baseline",
        help="Baseline report root dir (default: reports/baseline)",
    )
    p_base.add_argument(
        "--judgment-policy",
        default="reuse_only",
        choices=["reuse_only", "regenerate_missing", "regenerate_all"],
        help="How to resolve predictions for the split universe",
    )
    p_base.add_argument(
        "--required-model-id",
        required=False,
        default=None,
        help="If set, existing judgments must match model_id to be reusable",
    )
    p_base.add_argument(
        "--required-judgment-schema-version",
        required=False,
        default=None,
        help="If set, existing judgments must match judgment_schema_version to be reusable",
    )
    p_base.add_argument(
        "--force",
        action="store_true",
        help="Allow overwriting existing reports/baseline/<dataset>/<freeze_id>/ directory",
    )

    args = p.parse_args(argv)

    if args.cmd == "hybrid-judgments":
        from openlabos_eval.hybrid_validator import HybridValidationError, build_hybrid_judgments

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

    if args.cmd == "dataset":
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        data_root = Path(args.data_root).resolve() if getattr(args, "data_root", None) else default_data_root()
        sqlite_path = Path(args.sqlite)
        if args.ds_cmd == "export-candidates":
            out = (
                Path(args.out)
                if args.out
                else (repo_root / "data" / "labels" / "candidates" / args.dataset_name / "candidates.jsonl")
            )
            rows = iter_candidate_clips(
                sqlite_path=sqlite_path,
                data_root=data_root,
                only_generated=True,
                require_step_id=not args.include_missing_step,
                only_unjudged=not args.include_judged,
            )
            write_candidates_jsonl(out, rows)
            print(f"Wrote {out}")
            return 0

        train_path = Path(args.train)
        val_path = Path(args.val)
        test_path = Path(args.test)
        try:
            train, val, test = validate_split_files(train_path=train_path, val_path=val_path, test_path=test_path)
            if not args.no_db_check:
                validate_clips_exist_in_db(
                    sqlite_path=sqlite_path,
                    clip_ids=[r.clip_id for r in (train + val + test)],
                )
        except (FreezeDatasetError, DatasetError) as e:
            print(str(e))
            return 2

        if args.ds_cmd == "validate":
            print("OK: dataset splits validated")
            return 0

        try:
            res = freeze_dataset(
                dataset_name=args.dataset_name,
                freeze_id=args.freeze_id,
                train_path=train_path,
                val_path=val_path,
                test_path=test_path,
                out_root=(repo_root / "data" / "splits"),
                sqlite_path=sqlite_path,
                strict_db_check=not args.no_db_check,
                notes=args.notes,
                force=bool(args.force),
            )
        except FreezeDatasetError as e:
            print(str(e))
            return 2
        print(f"Froze dataset to {res.out_dir}")
        print(f"Wrote {res.manifest_path}")
        return 0

    if args.cmd == "baseline":
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        dataset_dir = Path(args.dataset_dir)
        sqlite_path = Path(args.sqlite)
        report_root = Path(args.report_root)
        if not report_root.is_absolute():
            report_root = repo_root / report_root
        try:
            cfg = run_baseline(
                dataset_dir=dataset_dir,
                split=str(args.split),
                sqlite_path=sqlite_path,
                report_root=report_root,
                judgment_policy=str(args.judgment_policy),
                required_model_id=args.required_model_id,
                required_judgment_schema_version=args.required_judgment_schema_version,
                force=bool(args.force),
            )
        except (BaselineError, DatasetError) as e:
            print(str(e))
            return 2
        print(f"Wrote baseline reports and canonical lock to {cfg.report_dir}")
        return 0

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.cmd == "dashboard-events":
        events_path = Path(args.events)
        rows = extract_verifications(_iter_jsonl(events_path))
        report = compute_metrics(rows, confidence_threshold=args.confidence_threshold)
        report["inputs"] = {"events": str(events_path)}
        out_json, out_md = write_report(out_dir, report)
        print(f"Wrote {out_json}")
        print(f"Wrote {out_md}")
        return 0

    dataset_path = Path(args.dataset)
    sqlite_path = Path(args.sqlite)
    if not sqlite_path.exists():
        print(f"SQLite DB not found: {sqlite_path}")
        return 2

    try:
        labels = parse_dataset(dataset_path)
    except DatasetError as e:
        print(str(e))
        return 2
    clip_ids = [r.clip_id for r in labels]
    conn = sqlite3.connect(str(sqlite_path))
    try:
        preds = load_latest_predictions(conn, clip_ids, required_model_id=args.required_model_id)
    finally:
        conn.close()

    report = compute_judgment_metrics(labels, preds)
    report["inputs"] = {
        "dataset": str(dataset_path),
        "sqlite": str(sqlite_path),
        "required_model_id": args.required_model_id,
    }
    out_json = out_dir / "judgment-eval.json"
    out_md = out_dir / "judgment-eval.md"
    out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")

    md: list[str] = []
    md.append("# Judgment eval\n\n## Summary\n")
    counts = report.get("counts", {})
    metrics = report.get("metrics", {})
    md.append(f"- labeled_clips: **{counts.get('labeled_clips', 0)}**\n")
    md.append(f"- judgments_found: **{counts.get('judgments_found', 0)}**\n")
    md.append(f"- missing_or_invalid_judgments: **{counts.get('missing_or_invalid_judgments', 0)}**\n")
    md.append(f"- judgment_coverage_rate: **{metrics.get('judgment_coverage_rate')}**\n")
    md.append(f"- step_complete_accuracy: **{metrics.get('step_complete_accuracy')}**\n")
    md.append(f"- issue_detection_f1: **{metrics.get('issue_detection', {}).get('f1')}**\n")
    md.append(f"- objects_micro_f1: **{metrics.get('objects_micro', {}).get('f1')}**\n")
    md.append(f"- action_detected_accuracy: **{metrics.get('action_detected_accuracy')}**\n")
    out_md.write_text("".join(md), encoding="utf-8")

    print(f"Wrote {out_json}")
    print(f"Wrote {out_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
