# TASK-0010: baseline packaging

## Scope

- Add a **baseline packaging** workflow for **frozen dataset splits**.
- Produce baseline reports under `reports/baseline/<dataset>/<freeze_id>/`.
- Produce a separate **`baseline-lock.json` only under that report directory** (canonical lock). Do not mutate the frozen dataset `manifest.json` or add lock files under `data/splits/`.

Out of scope:

- Any training (SFT/GRPO).
- Any mutation of frozen dataset files or `manifest.json`.
- Any experiment tracking / cloud workflow.

## Files changed

- `services/eval/labos_eval/baseline_run.py`
- `services/eval/labos_eval/run_metrics.py`
- `docs/runbooks/baseline-run.md`
- `docs/verification/TASK-0010-baseline-packaging.md`
- `docs/journals/day-10.md`

## Implementation summary

- Added a new `baseline` CLI command that:
  - Loads a chosen frozen split JSONL (default `test.jsonl`) as the **entire evaluation universe**
  - Resolves judgments per an explicit policy (`reuse_only`, `regenerate_missing`, `regenerate_all`)
  - Applies **documented** reusability rules (see runbook): latest judgment per clip; **must** match split `step_id`; optional `model_id` and `judgment_schema_version` via CLI
  - Runs the existing TASK-0008 judgment eval harness
  - Writes `baseline-config.json`, `judgment-eval.json`, `judgment-eval.md`, and **`baseline-lock.json`** (single canonical copy) under the report directory

## Judgment reusability (exact fields)

Compared by code:

| Check | Source | When |
| --- | --- | --- |
| Latest row per clip | `judgments` window `ORDER BY created_at DESC, judgment_id DESC` | Always |
| Step matches label | `judgments.step_id` vs split JSONL `step_id` for that `clip_id` | Always |
| Model | `judgments.model_id` vs `--required-model-id` | Only if flag set |
| Schema version | `(judgment_schema_version or '1')` vs `--required-judgment-schema-version` | Only if flag set |

**Not** compared (honest gap): prompt version, frame policy / max frames, LM Studio sampling params. For a provably clean first baseline, use `regenerate_all` and then pin reuse with both optional flags.

## How to run

Prereqs:

- API SQLite DB exists at `apps/api/var/labos_sessions.sqlite`
- If using regeneration, the API server is running and reachable at `LABOS_API_BASE_URL` (default `http://127.0.0.1:8000`)

Run baseline:

```bash
cd services/eval
uv sync --python 3.12
uv run labos-eval-metrics baseline ^
  --dataset-dir ..\..\data\splits\<dataset>\<freeze_id> ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --split test ^
  --judgment-policy reuse_only
```

## Manual verification steps

1. Pick a frozen dataset dir `data/splits/<dataset>/<freeze_id>/` that contains `test.jsonl`.
2. Run baseline with `--judgment-policy reuse_only`.
   - If any clip lacks a reusable judgment, confirm it fails loudly with a clear count.
3. Run baseline with `--judgment-policy regenerate_missing` (API running).
4. Confirm artifacts exist **only** under reports:
   - `reports/baseline/<dataset>/<freeze_id>/baseline-config.json`
   - `reports/baseline/<dataset>/<freeze_id>/judgment-eval.json`
   - `reports/baseline/<dataset>/<freeze_id>/judgment-eval.md`
   - `reports/baseline/<dataset>/<freeze_id>/baseline-lock.json`
5. Confirm the frozen dataset directory still contains only freeze outputs (e.g. no `baseline-lock.json` next to `manifest.json`).
6. Confirm `manifest.json` is unchanged.

## Open questions

None for TASK-0010 closure; follow-on is TASK-0011 (SFT).

## Notes

- Default policy is intentionally strict on *regeneration* (no silent rerolls); reuse semantics are explicit in the runbook because stored metadata is intentionally limited.
