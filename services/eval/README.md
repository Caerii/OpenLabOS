# services/eval — OpenLabOS evaluation harness

Offline evaluation harness for OpenLabOS. This service consumes RunManifests
emitted into `services/api`'s artifact store and computes reproducible reports
without ever touching the live API or training services at runtime.

## What it does

- **Run metrics**: compute object/action agreement, step-completion accuracy,
  issue-detection P/R/F1, and JSON validity rates against a frozen labeled
  dataset. CLI: `openlabos-eval-metrics judgments` and the legacy
  `openlabos-eval-metrics dashboard-events`.
- **Hybrid validator**: build protocol-constrained hybrid judgments by
  combining a baseline model and an SFT model under a protocol's
  expected-action / allowed-failure-mode rules. CLI:
  `openlabos-eval-metrics hybrid-judgments`.
- **Dataset freezing**: validate train/val/test JSONL splits (schema, vocab,
  overlap, DB existence), then freeze them with manifest + sha256 hashes
  under `data/splits/<dataset>/<freeze_id>/`. CLI:
  `openlabos-eval-metrics dataset {export-candidates,validate,freeze}`.
- **Judgment-eval comparison**: score stored SQLite `judgments` rows (latest
  per `clip_id`) against gold labels and emit JSON + Markdown reports.
- **Baseline-run baseline**: package a reproducible baseline for a frozen
  split — `baseline-config.json`, `judgment-eval.{json,md}`, and a canonical
  `baseline-lock.json`. CLI: `openlabos-eval-metrics baseline`.

## Bootstrap

This service uses **Python 3.12** (see `.python-version`).

```bash
cd services/eval
uv sync --python 3.12
```

## Run metrics against a saved RunManifest

The RunManifest references a frozen dataset split JSONL and the API's SQLite
artifact store. To score the latest stored judgments against gold labels:

```bash
uv run openlabos-eval-metrics judgments \
  --dataset <path/to/frozen-split.jsonl> \
  --sqlite  <path/to/openlabos_sessions.sqlite> \
  --out     <reports/eval/run-YYYYMMDD>
```

Artifacts:

- `<out>/judgment-eval.json`
- `<out>/judgment-eval.md`

For a fully packaged baseline (config + report + lock) over a frozen split:

```bash
uv run openlabos-eval-metrics baseline \
  --dataset-dir <data/splits/<dataset>/<freeze_id>> \
  --sqlite      <path/to/openlabos_sessions.sqlite>
```

## Boundaries

This service is **offline**. It does not run the API, the inference
pipeline, or the training loop. It only reads:

- frozen dataset JSONL files (immutable once written)
- the SQLite artifact store produced by `services/api`
- protocol JSON definitions

All outputs are written under `reports/` (or a caller-specified directory).
Eval sets are immutable once frozen — never mutate held-out data in place.
