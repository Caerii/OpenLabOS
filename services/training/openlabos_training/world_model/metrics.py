from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence


def recall_at_k(retrieved: Sequence[str], gold: Sequence[str], k: int) -> Optional[float]:
    gold_set = {ref for ref in gold if ref}
    if not gold_set:
        return None
    top = [ref for ref in retrieved[:k] if ref]
    if not top:
        return 0.0
    hits = sum(1 for ref in top if ref in gold_set)
    return hits / len(gold_set)


def average(values: Iterable[Optional[float]]) -> Optional[float]:
    nums = [value for value in values if value is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def percentile(values: List[float], p: float) -> Optional[float]:
    if not values:
        return None
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, int(round((p / 100) * (len(sorted_values) - 1)))))
    return sorted_values[index]


STACK_WEIGHTS: Dict[str, Dict[str, float]] = {
    "a": {
        "manifest_join_integrity": 0.15,
        "media_coverage_rate": 0.15,
        "step_localization_accuracy": 0.20,
        "evidence_recall_at_5": 0.20,
        "ingest_latency_ms": 0.10,
        "query_latency_p95_ms": 0.10,
        "stack_fit_score": 0.10,
    },
    "b": {
        "manifest_join_integrity": 0.10,
        "media_coverage_rate": 0.15,
        "step_localization_accuracy": 0.10,
        "evidence_recall_at_5": 0.10,
        "ingest_latency_ms": 0.10,
        "query_latency_p95_ms": 0.05,
        "stack_fit_score": 0.40,
    },
    "c": {
        "manifest_join_integrity": 0.10,
        "media_coverage_rate": 0.10,
        "step_localization_accuracy": 0.10,
        "evidence_recall_at_5": 0.10,
        "ingest_latency_ms": 0.15,
        "query_latency_p95_ms": 0.10,
        "stack_fit_score": 0.35,
    },
}

STACK_FIT_PRIOR = {"a": 0.94, "b": 0.74, "c": 0.81}


def normalize_latency_score(latency_ms: Optional[float], *, good_ms: float = 50, bad_ms: float = 2000) -> Optional[float]:
    if latency_ms is None:
        return None
    if latency_ms <= good_ms:
        return 1.0
    if latency_ms >= bad_ms:
        return 0.0
    return 1.0 - ((latency_ms - good_ms) / (bad_ms - good_ms))


def weighted_stack_score(stack_id: str, metrics: Dict[str, Any]) -> Optional[float]:
    weights = STACK_WEIGHTS.get(stack_id)
    if not weights:
        return None
    total_weight = 0.0
    total_score = 0.0
    for key, weight in weights.items():
        if key == "stack_fit_score":
            value = STACK_FIT_PRIOR.get(stack_id)
        elif key == "ingest_latency_ms":
            value = normalize_latency_score(metrics.get("ingestLatencyMs"))
        elif key == "query_latency_p95_ms":
            value = normalize_latency_score(metrics.get("queryLatencyP95Ms"), good_ms=100, bad_ms=3000)
        else:
            value = metrics.get(key)
        if value is None:
            continue
        total_weight += weight
        total_score += float(value) * weight
    if total_weight <= 0:
        return None
    return total_score / total_weight


def summarize_query_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    localization = [row.get("stepLocalizationCorrect") for row in rows if row.get("stepLocalizationCorrect") is not None]
    recall = [row.get("evidenceRecallAt5") for row in rows if row.get("evidenceRecallAt5") is not None]
    latencies = [float(row["queryLatencyMs"]) for row in rows if isinstance(row.get("queryLatencyMs"), (int, float))]
    return {
        "queryCount": len(rows),
        "stepLocalizationAccuracy": average(localization),
        "evidenceRecallAt5": average(recall),
        "queryLatencyP95Ms": percentile(latencies, 95),
    }
