from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from openlabos_training.world_model.manifest_io import episode_from_path, iter_manifest_files
from openlabos_training.world_model.metrics import summarize_query_rows, weighted_stack_score
from openlabos_training.world_model.query_suite import build_query_suite
from openlabos_training.world_model.stacks import (
    StackIngestContext,
    build_stack_runners,
    episode_metrics,
)


SCHEMA_VERSION = "labos.world-model-shootout.v1"


def _iso_stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_label(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in value).strip("-") or "shootout"


def _parse_run_ids(raw: str) -> Optional[set[str]]:
    if not raw.strip():
        return None
    return {part.strip() for part in raw.split(",") if part.strip()}


def _parse_stacks(raw: str) -> List[str]:
    stacks = [part.strip().lower() for part in raw.split(",") if part.strip()]
    return stacks or ["a", "b", "c"]


def run_shootout(
    *,
    manifest_dir: Path,
    data_root: Optional[Path],
    run_ids: Optional[set[str]],
    label: str,
    phase: int,
    stacks: List[str],
    dry_run: bool,
    out_dir: Path,
) -> Dict[str, Any]:
    started = time.perf_counter()
    episodes = []
    for manifest_path in iter_manifest_files(manifest_dir):
        episode = episode_from_path(manifest_path)
        if run_ids and episode.run_id not in run_ids:
            continue
        episodes.append(episode)

    runners = build_stack_runners(stacks, phase=phase)
    all_queries = []
    for episode in episodes:
        all_queries.extend(build_query_suite(episode.run_id, episode.manifest))

    if dry_run:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": _iso_stamp(),
            "label": label,
            "phase": phase,
            "dryRun": True,
            "manifestCount": len(episodes),
            "queryCount": len(all_queries),
            "manifests": [str(ep.path) for ep in episodes],
            "stacks": [runner.stack_id for runner in runners],
        }

    stack_reports: Dict[str, Any] = {}
    for runner in runners:
        episode_rows: List[Dict[str, Any]] = []
        query_rows: List[Dict[str, Any]] = []
        ingest_latencies: List[float] = []

        for episode in episodes:
            ctx = StackIngestContext(episode=episode, data_root=data_root)
            ingest_ms = runner.ingest(ctx)
            ingest_latencies.append(ingest_ms)
            base_metrics = episode_metrics(ctx)
            episode_rows.append(
                {
                    "runId": episode.run_id,
                    "protocolId": episode.protocol_id,
                    "manifestPath": str(episode.path),
                    "ingestLatencyMs": ingest_ms,
                    **base_metrics,
                },
            )

            queries = build_query_suite(episode.run_id, episode.manifest)
            for query in queries:
                result = runner.answer(ctx, query)
                query_rows.append(
                    {
                        "stackId": runner.stack_id,
                        "runId": episode.run_id,
                        "queryId": result.query_id,
                        "queryType": query.query_type,
                        "prompt": query.prompt,
                        "goldStepNumber": query.gold_step_number,
                        "retrievedStepNumber": result.retrieved_step_number,
                        "stepLocalizationCorrect": result.step_localization_correct,
                        "evidenceRecallAt5": result.evidence_recall_at_5,
                        "queryLatencyMs": result.query_latency_ms,
                        "retrievedRefCount": len(result.retrieved_refs),
                        "answerText": result.answer_text,
                    },
                )

        query_summary = summarize_query_rows(query_rows)
        aggregate_metrics = {
            "manifestJoinIntegrity": _average([row.get("manifestJoinIntegrity") for row in episode_rows]),
            "mediaCoverageRate": _average([row.get("mediaCoverageRate") for row in episode_rows]),
            "ingestLatencyMs": _average(ingest_latencies),
            "stepLocalizationAccuracy": query_summary.get("stepLocalizationAccuracy"),
            "evidenceRecallAt5": query_summary.get("evidenceRecallAt5"),
            "queryLatencyP95Ms": query_summary.get("queryLatencyP95Ms"),
        }
        aggregate_metrics["weightedScore"] = weighted_stack_score(runner.stack_id, aggregate_metrics)

        stack_reports[runner.stack_id] = {
            "stackId": runner.stack_id,
            "stackName": runner.stack_name,
            "episodeCount": len(episode_rows),
            "metrics": aggregate_metrics,
            "episodes": episode_rows,
            "queries": query_rows,
        }

    elapsed_ms = (time.perf_counter() - started) * 1000.0
    ranking = sorted(
        (
            {
                "stackId": stack_id,
                "weightedScore": report["metrics"].get("weightedScore"),
                "stackName": report["stackName"],
            }
            for stack_id, report in stack_reports.items()
        ),
        key=lambda item: (item["weightedScore"] is not None, item["weightedScore"] or 0.0),
        reverse=True,
    )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": _iso_stamp(),
        "label": label,
        "phase": phase,
        "manifestDir": str(manifest_dir),
        "dataRoot": str(data_root) if data_root else None,
        "manifestCount": len(episodes),
        "queryCount": len(all_queries),
        "elapsedMs": elapsed_ms,
        "ranking": ranking,
        "stacks": stack_reports,
        "artifactPath": str(out_dir),
    }


def _average(values: Sequence[Optional[float]]) -> Optional[float]:
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def _print_summary(report: Dict[str, Any]) -> None:
    print(f"World-model shootout ({report.get('label')}) phase={report.get('phase')}")
    print(f"Manifests: {report.get('manifestCount')}  Queries: {report.get('queryCount')}  Elapsed: {report.get('elapsedMs', 0):.0f} ms")
    if report.get("dryRun"):
        return
    print("Ranking:")
    for index, entry in enumerate(report.get("ranking") or [], start=1):
        score = entry.get("weightedScore")
        score_text = f"{score:.3f}" if isinstance(score, (int, float)) else "n/a"
        print(f"  {index}. Stack {entry.get('stackId').upper()} ({entry.get('stackName')}): {score_text}")
        stack = (report.get("stacks") or {}).get(entry.get("stackId"), {})
        metrics = stack.get("metrics") or {}
        coverage = metrics.get("mediaCoverageRate")
        localization = metrics.get("stepLocalizationAccuracy")
        recall = metrics.get("evidenceRecallAt5")
        if coverage is not None:
            print(f"     media_coverage={coverage:.2%}  step_loc={_fmt(localization)}  recall@5={_fmt(recall)}")


def _fmt(value: Optional[float]) -> str:
    if value is None:
        return "n/a"
    return f"{value:.2%}"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="openlabos-world-model-shootout",
        description="Compare world-model stacks A/B/C on KitchenSessionManifest files.",
    )
    parser.add_argument("--manifest-dir", required=True, help="Directory containing kitchen session manifests.")
    parser.add_argument("--data-root", default="", help="services/api/data root for frameRef resolution.")
    parser.add_argument("--run-ids", default="", help="Comma-separated run id filter.")
    parser.add_argument("--label", default="shootout", help="Label for the output artifact.")
    parser.add_argument("--phase", type=int, default=0, choices=[0, 1], help="0=structural, 1=+optional CLIP retrieval.")
    parser.add_argument("--stacks", default="a,b,c", help="Comma-separated stack ids: a,b,c")
    parser.add_argument("--out-dir", default="", help="Output directory (default: services/training/artifacts/world-model-shootout).")
    parser.add_argument("--dry-run", action="store_true", help="List manifests and queries only.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    manifest_dir = Path(args.manifest_dir).resolve()
    if not manifest_dir.is_dir():
        print(f"manifest dir not found: {manifest_dir}", file=sys.stderr)
        return 2

    data_root = Path(args.data_root).resolve() if args.data_root else None
    if data_root is not None and not data_root.is_dir():
        print(f"warning: data root does not exist: {data_root}", file=sys.stderr)
        data_root = None

    default_out = Path(__file__).resolve().parents[2] / "artifacts" / "world-model-shootout"
    out_dir = Path(args.out_dir).resolve() if args.out_dir else default_out
    out_dir.mkdir(parents=True, exist_ok=True)

    report = run_shootout(
        manifest_dir=manifest_dir,
        data_root=data_root,
        run_ids=_parse_run_ids(args.run_ids),
        label=_safe_label(args.label),
        phase=args.phase,
        stacks=_parse_stacks(args.stacks),
        dry_run=args.dry_run,
        out_dir=out_dir,
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    artifact_name = f"{report['label']}-{stamp}.json"
    artifact_path = out_dir / artifact_name
    artifact_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    report["artifactPath"] = str(artifact_path)

    _print_summary(report)
    print(f"Wrote {artifact_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
