# Post-SFT inference integration (HF + PEFT → SQLite)

## Scope

- Provide a **reproducible local command** that loads a **TASK-0011 SFT adapter** and writes **judgments** into the **same SQLite schema** as the API.
- Reuse **identical** prompt + frame selection + JSON validation as `POST /judgments`.
- **Do not** add GRPO, dashboards, or a second eval framework.

## Files

- `services/training/labos_training/post_sft_infer.py`
- `services/training/labos_training/cli.py` (`infer-hf-judgments`)
- `services/training/pyproject.toml` (`labos-infer-hf-judgments` script)
- `docs/runbooks/post-sft-inference.md`
- `docs/journals/day-12.md`
- Updates: `services/training/README.md`, `docs/runbooks/training.md`, `docs/decisions/0013-adaptation-training-stack.md`

## Design answers (from product review)

1. **Can LM Studio consume the trained artifact?**  
   **Not directly.** HF LoRA folders are for `transformers`/`peft`. LM Studio uses GGUF (e.g. jc-builds Qwen3.5-VLM). Merge/export is a separate step if you want LM Studio parity.

2. **How are post-SFT judgments distinguishable?**  
   **`judgments.model_id`** must be a **caller-supplied** string (`--judgment-model-id`) that does not collide with LM Studio’s `model_id` values.

3. **Repro command**  
   See `docs/runbooks/post-sft-inference.md` (`labos-training infer-hf-judgments`). Supports **`--frozen-dir` + `--split`** or **`--split-jsonl`** (mutually exclusive).

4. **Provenance metadata**  
   `infer_manifest.json` records split, sqlite, adapter dir, base HF id, chosen `judgment_model_id`, argv, and outcome counts.

## Manual verification

1. Complete a tiny real SFT run (TASK-0011 smoke).
2. Run `infer-hf-judgments` with `--limit 2 --dry-run` and confirm no SQLite writes.
3. Run without `--dry-run` and confirm new rows appear with the chosen `model_id`.
4. Run `labos-eval-metrics judgments` on the same split and confirm metrics change only when expected.

## Notes

- Invalid JSON from the model increments **`parse_fail`** in the manifest; rows are **not** inserted (explicit, not silent).
- `step_id` mismatch increments **`step_mismatch`** and skips insert (same spirit as API 502 on mismatch).
