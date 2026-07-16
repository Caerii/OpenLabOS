# TASK-0008: eval-harness

## Scope

Build the first evaluation harness for judged clips:

- frozen labeled dataset format (JSONL)
- metrics:
  - object recognition precision/recall/F1 (micro, set-based)
  - step completion accuracy
  - issue detection precision/recall
  - JSON/judgment validity rate (missing judgments counted, not dropped)
  - action detection accuracy (cheap, exact match)
- one CLI entrypoint producing demo-friendly report artifacts
- metric and dataset docs under `docs/eval/`

## Judgment source of truth

**SQLite DB** produced by `apps/api` (`apps/api/var/labos_sessions.sqlite`). We do not support exported JSON and DB simultaneously in this MVP harness.

## Files created / changed (key)

- `services/eval/labos_eval/judgment_eval.py`
- `services/eval/labos_eval/run_metrics.py` (adds `judgments` subcommand; keeps `dashboard-events`)
- `docs/eval/dataset-spec.md`
- `docs/eval/metric-definitions.md`
- `services/eval/README.md`
- `docs/journals/day-08.md`

## How to run

From `services/eval`:

```bash
uv sync --python 3.12
uv run labos-eval-metrics judgments --dataset <labels.jsonl> --sqlite <labos_sessions.sqlite> --out <report_dir>
```

Outputs:
- `judgment-eval.json`
- `judgment-eval.md`

## Metric semantics (MVP)

- **objects_seen**: evaluated as sets; micro P/R/F1 computed over all object ids across clips.
- **step_complete**: exact boolean match accuracy.
- **action_detected**: exact match including null.
- **possible_issue**: type-aware single-label metric; wrong issue type counts as both FP and FN.
- **latest judgment per clip**: selected by `created_at` DESC, tie-break by `judgment_id` DESC.
- **judgment coverage rate**: clip is valid iff a schema-valid/vocab-valid judgment exists for the clip; missing or malformed rows count against the denominator.

