from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openlabos_eval.judgment_eval import parse_dataset


class BaselineError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def now_utc_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def api_base_url() -> str:
    return os.environ.get("OPENLABOS_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _post_json(url: str, payload: dict[str, Any], timeout_s: float = 60) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise BaselineError(f"API HTTP error {e.code} from {url}: {detail}") from e
    except urllib.error.URLError as e:
        raise BaselineError(f"API unreachable at {url}: {e}") from e
    try:
        obj = json.loads(raw) if raw else {}
    except json.JSONDecodeError as e:
        raise BaselineError(f"API returned non-JSON from {url}") from e
    if not isinstance(obj, dict):
        raise BaselineError("API response must be a JSON object")
    return obj


def trigger_judgment(*, clip_id: str, step_id: str) -> dict:
    url = f"{api_base_url()}/judgments"
    return _post_json(url, {"clip_id": clip_id, "step_id": step_id})


def judgments_for_clips(conn: sqlite3.Connection, clip_ids: list[str]) -> dict[str, dict[str, Any]]:
    """
    Returns latest judgment metadata per clip_id (created_at DESC, judgment_id DESC).

    Fields are used for baseline *reusability* checks (see docs/runbooks/baseline-run.md).
    """
    if not clip_ids:
        return {}
    q = ",".join(["?"] * len(clip_ids))
    rows = conn.execute(
        f"""
        SELECT clip_id, judgment_id, created_at, model_id, judgment_schema_version, step_id
        FROM (
          SELECT
            j.clip_id, j.judgment_id, j.created_at, j.model_id, j.judgment_schema_version, j.step_id,
            ROW_NUMBER() OVER (
              PARTITION BY clip_id
              ORDER BY created_at DESC, judgment_id DESC
            ) AS rn
          FROM judgments j
          WHERE clip_id IN ({q})
        )
        WHERE rn = 1
        """,
        tuple(clip_ids),
    ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        out[str(r[0])] = {
            "judgment_id": str(r[1]),
            "created_at": str(r[2]),
            "model_id": r[3],
            "judgment_schema_version": r[4],
            "step_id": str(r[5]) if r[5] is not None else None,
        }
    return out


@dataclass(frozen=True)
class BaselineConfig:
    dataset_name: str
    freeze_id: str
    split_name: str
    split_path: Path
    sqlite_path: Path
    report_dir: Path
    judgment_policy: str  # reuse_only | regenerate_missing | regenerate_all
    required_model_id: str | None
    required_judgment_schema_version: str | None
    api_base_url: str


def require_no_overwrite(path: Path, *, force: bool) -> None:
    if path.exists() and not force:
        raise BaselineError(f"Refusing to overwrite existing path: {path}")


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2), encoding="utf-8")


def run_baseline(
    *,
    dataset_dir: Path,
    split: str,
    sqlite_path: Path,
    report_root: Path,
    judgment_policy: str,
    required_model_id: str | None,
    required_judgment_schema_version: str | None,
    force: bool,
) -> BaselineConfig:
    # dataset_dir = data/splits/<dataset>/<freeze_id>
    dataset_dir = dataset_dir.resolve()
    freeze_id = dataset_dir.name
    dataset_name = dataset_dir.parent.name
    split_name = split
    split_path = dataset_dir / f"{split}.jsonl"
    if not split_path.exists():
        raise BaselineError(f"Split file not found: {split_path}")

    report_dir = (report_root / dataset_name / freeze_id).resolve()
    if report_dir.exists() and not force:
        raise BaselineError(f"Refusing to overwrite existing path: {report_dir}")

    # Single canonical lock: under the baseline report directory only (no writes under data/splits/).
    report_lock_path = report_dir / "baseline-lock.json"
    if report_lock_path.exists() and not force:
        raise BaselineError(f"Refusing to overwrite existing path: {report_lock_path}")

    cfg = BaselineConfig(
        dataset_name=dataset_name,
        freeze_id=freeze_id,
        split_name=split_name,
        split_path=split_path,
        sqlite_path=sqlite_path.resolve(),
        report_dir=report_dir,
        judgment_policy=judgment_policy,
        required_model_id=required_model_id,
        required_judgment_schema_version=required_judgment_schema_version,
        api_base_url=api_base_url(),
    )

    # Load labels (evaluation universe)
    labels = parse_dataset(split_path)
    clip_ids = [r.clip_id for r in labels]
    step_by_clip = {r.clip_id: r.step_id for r in labels}

    # Resolve existing judgments
    if not sqlite_path.exists():
        raise BaselineError(f"SQLite DB not found: {sqlite_path}")
    conn = sqlite3.connect(str(sqlite_path))
    try:
        existing = judgments_for_clips(conn, clip_ids)
    finally:
        conn.close()

    def is_reusable(cid: str, meta: dict[str, Any]) -> bool:
        # Always: judgment must be for the same step as the gold row in the split (clip association).
        if meta.get("step_id") != step_by_clip[cid]:
            return False
        if required_model_id is not None and meta.get("model_id") != required_model_id:
            return False
        if (
            required_judgment_schema_version is not None
            and (meta.get("judgment_schema_version") or "1") != required_judgment_schema_version
        ):
            return False
        return True

    missing_or_mismatch: list[str] = []
    for cid in clip_ids:
        meta = existing.get(cid)
        if meta is None or not is_reusable(cid, meta):
            missing_or_mismatch.append(cid)

    if judgment_policy not in {"reuse_only", "regenerate_missing", "regenerate_all"}:
        raise BaselineError("judgment_policy must be reuse_only|regenerate_missing|regenerate_all")

    to_generate: list[str] = []
    if judgment_policy == "reuse_only":
        if missing_or_mismatch:
            raise BaselineError(
                f"Missing or non-reusable judgments for {len(missing_or_mismatch)} clip(s). "
                f"Use regenerate_missing/regenerate_all explicitly.",
            )
    elif judgment_policy == "regenerate_all":
        to_generate = clip_ids
    else:
        to_generate = missing_or_mismatch

    # Trigger judgments via API (synchronous)
    generated: list[dict[str, Any]] = []
    for cid in to_generate:
        step_id = step_by_clip[cid]
        resp = trigger_judgment(clip_id=cid, step_id=step_id)
        generated.append({"clip_id": cid, "response": resp})

    # Run eval harness (subprocess-free: reuse module directly)
    from openlabos_eval.judgment_eval import compute_metrics, load_latest_predictions

    conn = sqlite3.connect(str(sqlite_path))
    try:
        preds = load_latest_predictions(conn, clip_ids)
    finally:
        conn.close()
    report = compute_metrics(labels, preds)
    report["inputs"] = {
        "dataset_dir": str(dataset_dir),
        "split": split_name,
        "sqlite": str(sqlite_path),
        "judgment_policy": judgment_policy,
        "required_model_id": required_model_id,
        "required_judgment_schema_version": required_judgment_schema_version,
        "api_base_url": cfg.api_base_url,
    }

    # Write report artifacts
    report_dir.mkdir(parents=True, exist_ok=True)
    eval_json = report_dir / "judgment-eval.json"
    eval_md = report_dir / "judgment-eval.md"
    write_json(eval_json, report)
    # reuse markdown formatting similar to TASK-0008
    counts = report.get("counts", {})
    metrics = report.get("metrics", {})
    md = []
    md.append("# Baseline judgment eval\n\n## Summary\n")
    md.append(f"- labeled_clips: **{counts.get('labeled_clips', 0)}**\n")
    md.append(f"- judgments_found: **{counts.get('judgments_found', 0)}**\n")
    md.append(f"- missing_or_invalid_judgments: **{counts.get('missing_or_invalid_judgments', 0)}**\n")
    md.append(f"- judgment_coverage_rate: **{metrics.get('judgment_coverage_rate')}**\n")
    md.append(f"- step_complete_accuracy: **{metrics.get('step_complete_accuracy')}**\n")
    md.append(f"- issue_detection_f1: **{metrics.get('issue_detection', {}).get('f1')}**\n")
    md.append(f"- objects_micro_f1: **{metrics.get('objects_micro', {}).get('f1')}**\n")
    md.append(f"- action_detected_accuracy: **{metrics.get('action_detected_accuracy')}**\n")
    eval_md.write_text("".join(md), encoding="utf-8")

    created_at = now_utc_iso()
    split_sha = sha256_file(split_path)
    eval_sha = sha256_file(eval_json)

    baseline_cfg_path = report_dir / "baseline-config.json"
    write_json(
        baseline_cfg_path,
        {
            "created_at": created_at,
            "dataset_name": dataset_name,
            "freeze_id": freeze_id,
            "dataset_dir": str(dataset_dir),
            "split_evaluated": split_name,
            "split_path": str(split_path),
            "split_sha256": split_sha,
            "sqlite_path": str(sqlite_path),
            "prediction_source": "sqlite judgments table (latest per clip_id)",
            "judgment_policy": judgment_policy,
            "required_model_id": required_model_id,
            "required_judgment_schema_version": required_judgment_schema_version,
            "api_base_url": cfg.api_base_url,
            "generated_count": len(to_generate),
            "judgment_reuse_checks": {
                "always_compared": [
                    "Latest row per clip_id in judgments (ORDER BY created_at DESC, judgment_id DESC).",
                    "judgments.step_id must equal step_id from the split JSONL row for that clip_id.",
                ],
                "optional_cli_constraints": [
                    "If required_model_id is set: judgments.model_id must equal it.",
                    "If required_judgment_schema_version is set: (judgment_schema_version or '1') must equal it.",
                ],
                "not_stored_or_not_compared": [
                    "Prompt version (no dedicated column; prompt_text exists but baseline does not hash/compare it).",
                    "Frame count / max_frames / frame selection policy (not persisted on judgment rows for comparison).",
                    "Other LM Studio inference parameters (temperature, etc.).",
                ],
                "first_canonical_baseline_recommendation": (
                    "If you need a squeaky-clean reference, use --judgment-policy regenerate_all "
                    "and set --required-model-id and --required-judgment-schema-version to match that run; "
                    "reuse_only without those flags only proves 'some latest judgment exists for the right step'."
                ),
            },
        },
    )

    lock_obj = {
        "canonical_baseline_lock": str(report_lock_path),
        "dataset_name": dataset_name,
        "freeze_id": freeze_id,
        "frozen_dataset_dir": str(dataset_dir),
        "split_evaluated": split_name,
        "locked_at": created_at,
        "locked_by": "baseline-run",
        "sqlite_path": str(sqlite_path),
        "prediction_source": "sqlite judgments table (latest per clip_id)",
        "judgment_policy": judgment_policy,
        "required_model_id": required_model_id,
        "required_judgment_schema_version": required_judgment_schema_version,
        "split_sha256": split_sha,
        "judgment_eval_report_path": str(eval_json),
        "judgment_eval_report_sha256": eval_sha,
        "baseline_report_dir": str(report_dir),
        "notes": "",
    }

    write_json(report_lock_path, lock_obj)

    return cfg
