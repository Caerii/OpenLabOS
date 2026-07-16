# Baseline run (frozen dataset)

## Goal

Create a **reproducible baseline evaluation event** for a **frozen dataset split** without mutating the frozen dataset descriptor (`manifest.json`) or adding files under `data/splits/`.

## Inputs

- **Frozen dataset dir**: `data/splits/<dataset_name>/<freeze_id>/`
  - `train.jsonl`, `val.jsonl`, `test.jsonl`, `manifest.json`
- **Split evaluated**: `test` by default (the split file is the evaluation universe)
- **SQLite DB**: `apps/api/var/labos_sessions.sqlite` (judgments source)
- **API for regeneration (optional)**: set `LABOS_API_BASE_URL` (default: `http://127.0.0.1:8000`)

## Outputs

All baseline artifacts, including the **single canonical** `baseline-lock.json`, live under the report directory:

```text
reports/baseline/<dataset_name>/<freeze_id>/
  baseline-config.json
  judgment-eval.json
  judgment-eval.md
  baseline-lock.json
```

The lock file includes `frozen_dataset_dir` so the evaluated freeze is unambiguous without writing anything next to the frozen split files.

## Canonical lock

- **Authoritative path**: `reports/baseline/<dataset_name>/<freeze_id>/baseline-lock.json`
- The field `canonical_baseline_lock` in that JSON repeats the same path for grep-friendly audits.
- **Nothing** is written under `data/splits/<dataset>/<freeze_id>/` except what the freeze workflow already created (`train.jsonl`, `val.jsonl`, `test.jsonl`, `manifest.json`).

## Judgment policy (explicit)

The baseline CLI resolves predictions for the clip universe (exactly the chosen split JSONL) using:

- `reuse_only` (default): **require** a reusable judgment for every clip, otherwise **fail loudly**
- `regenerate_missing`: call the API for only missing/non-reusable clips
- `regenerate_all`: call the API for every clip in the split

## What “reusable judgment” means (exact rules)

Baseline considers the **latest** stored judgment per `clip_id` (same rule as eval: `ORDER BY created_at DESC, judgment_id DESC`).

That row is **reusable** only if **all** of the following hold:

1. **Step association**  
   `judgments.step_id` must equal `step_id` from the **same** `clip_id` row in the evaluated split JSONL.  
   If the judgment is for a different step than the label row, it is **not** reusable.

2. **Optional: model**  
   If you pass `--required-model-id`, then `judgments.model_id` must equal that string (otherwise not reusable).

3. **Optional: schema version**  
   If you pass `--required-judgment-schema-version`, then the stored value is compared after coercing SQL `NULL` to the string `"1"` (to match API defaults). Otherwise not reusable.

If **neither** optional flag is set, reusability still requires (1); (2) and (3) are not enforced beyond “row exists for clip with matching step”.

### What is **not** compared today

The SQLite schema and baseline runner do **not** verify equivalence of:

- **Prompt version** — there is no dedicated `prompt_version` column; `prompt_text` exists but baseline does not hash or compare it.
- **Frame selection / max frames** — not persisted on the judgment row for comparison.
- **Other inference-time settings** (temperature, top-p, etc.) — not stored on the row.

So **`reuse_only` without `--required-model-id` and `--required-judgment-schema-version` is weaker than “same inference stack”**: it means “latest judgment exists for this clip and step,” not “provably identical pipeline.”

### First canonical baseline

For the **first** baseline you intend to treat as authoritative, use:

- `--judgment-policy regenerate_all` (after API is configured), **then**
- set `--required-model-id` and `--required-judgment-schema-version` to match that run so later **`reuse_only`** reruns are auditable.

If you skip regeneration and the optional flags, document that you are accepting weaker reuse semantics.

## How to run

From `services/eval`:

```bash
uv run labos-eval-metrics baseline ^
  --dataset-dir ..\..\data\splits\<dataset_name>\<freeze_id> ^
  --split test ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --judgment-policy reuse_only
```

Optional regeneration (explicit opt-in):

```bash
set LABOS_API_BASE_URL=http://127.0.0.1:8000
uv run labos-eval-metrics baseline ^
  --dataset-dir ..\..\data\splits\<dataset_name>\<freeze_id> ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --judgment-policy regenerate_missing
```

## Overwrite behavior

By default, the baseline workflow **refuses to overwrite** an existing `reports/baseline/<dataset>/<freeze_id>/` directory.

Use `--force` to overwrite.
