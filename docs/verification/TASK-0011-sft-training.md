# TASK-0011: judgment LoRA / SFT training

## Scope

- Initial **LoRA / SFT** path for the **LabOS demo judgment** task (structured JSON per clip + step).
- Work in **`services/training`**: explicit dataset preparation from **frozen TASK-0009** splits, single CLI entrypoint, local outputs.
- Reuse **API prompt and frame selection at prepare time only** via **`labos-api`**; training consumes **frozen** JSONL text.

Out of scope (explicit):

- GRPO / preference optimization (TASK-0012).
- In-training evaluation loop (use TASK-0008 + TASK-0010 afterward).
- Cloud experiment managers, notebooks-as-pipeline.

## Files changed (see repo for authoritative list)

- `services/training/labos_training/judgment_sft_prepare.py`
- `services/training/labos_training/train_judgment_sft.py`
- `services/training/labos_training/cli.py`
- `services/training/pyproject.toml`
- `services/training/README.md`
- `docs/runbooks/training.md`
- `docs/journals/day-11.md`
- `docs/decisions/0012-vision-language-baseline.md`, `docs/decisions/0013-adaptation-training-stack.md`
- `.gitignore` (`services/training/outputs/`)

---

## Review Q&A (manifests, split universe, targets, failures)

### 1) What is in `dataset-manifest.json` and `run-manifest.json`?

**`dataset-manifest.json` (prepare)** includes at minimum:

- `created_at`, `prompt_frozen_at`, `judgment_sft_row_schema_version`
- `dataset_name`, `freeze_id`, `frozen_dataset_dir`
- `train_split_source`, `val_split_source` (optional), **`test_split_excluded`** (explicit string)
- `split_universe_note` (order preserved, no inference outside split files)
- `data_root`, `protocol_path`, `sqlite_path`, `labos_api_package_version`
- `frame_policy` text (incl. empty-dir failure semantics)
- `target_fields_note` (alignment with TASK-0008 / `JudgmentResult`)
- `counts.train`, `counts.val`, optional **`small_train_warning`** (fewer than 8 train rows: plumbing test, not quality claims)
- `outputs.train_jsonl`, `outputs.val_jsonl`

**`run-manifest.json` (train)** includes at minimum:

- `created_at`, full `argv`
- `trainer` block: uses **`transformers.Trainer`**, note on TRL `SFTTrainer` vs current collator
- `base_model_id`, `processor_id` (same hub id today)
- `git_commit` (best effort: walk parents from train path / output / cwd for `.git`)
- `package_versions`: **`torch`**, **`transformers`**, **`peft`**, **`trl`**, **`accelerate`**, **`bitsandbytes`**, **`datasets`**
- `train_jsonl`, `val_jsonl`, `data_root`, `output_dir`
- `max_frames_env` (from `LABOS_JUDGMENT_MAX_FRAMES` at train time)
- `hyperparameters` (epochs, lr, LoRA, `--use-4bit`, `--bf16` / fp16 fallback flag, `--max-length`, `--shuffle-train`, etc.)
- `prepared_row_contract`, `target_serialization`, `confidence_convention`, `notes` (quant + AWS escape hatches)

`run-manifest.json` is written **before** `trainer.train()` so a failed run still leaves provenance.

### 2) Does `prepare-judgment-sft` preserve the frozen split universe exactly?

Yes:

- Reads **only** `train.jsonl` and, if present, `val.jsonl` under the frozen directory.
- **Does not read** `test.jsonl` (stated in manifest).
- Emits rows **in the same order** as each split file (no reshuffle in prepare).
- Training **defaults** to the same order; `--shuffle-train` is an explicit opt-in.

### 3) How are targets serialized for SFT?

- Each row’s `target_json` is a **`JudgmentResult`**-shaped dict (same fields TASK-0008 uses).
- The collator builds an assistant message whose **text** is **`json.dumps(target_json)`** (strict JSON string). That matches the inference contract (API parses strict JSON from model text).

### 4) Is `confidence=1.0` documented as a convenience convention?

Yes—in code docstring near `build_target_json`, `run-manifest.json` (`confidence_convention`), and service README.

### 5) Do trained targets align with eval-scored fields?

Yes: `objects_seen`, `action_detected`, `step_complete`, `possible_issue`, `step_id`, `judgment_schema_version`, plus `reason` (explanatory) and `confidence` (SFT placeholder, not calibrated).

### 6) What if frame directories exist but are empty?

`select_frames_for_clip` raises **`FrameSelectionError`** (“No frame files found …”). Prepare **fails loudly** for that row (no silent drop).

### 7) What does “reuse labos-api” mean in packaging terms?

- **`services/training` declares an editable path dependency on `labos-api`** (`pyproject.toml` + `[tool.uv.sources]`).
- **Prepare** imports `build_step_prompt`, `select_frames_for_clip`, `ProtocolRegistry`, `JudgmentResult`.
- **Train** imports **`labos_api.storage.media_paths.resolve_data_path` only**; it does **not** import the prompt builder.

### 8) Is `batch_size == 1` enforced and documented?

Yes: CLI returns **exit 2** if `--batch-size` ≠ `1`. Documented as a **current collator / Qwen multi-frame** constraint, not a fundamental requirement.

### 9) Does training fail early on missing CUDA, bad model, bad JSONL, bad paths?

Order of checks:

1. `--batch-size`
2. `torch` + **CUDA available**
3. `data-root` directory exists; output dir creatable
4. **Peek** first non-empty JSON line of train (and val if provided) for required keys
5. If `--val` set but missing → error
6. Full row load with per-line validation
7. **`AutoProcessor.from_pretrained`** before loading the full model (catches bad hub id / stale transformers early)
8. Then model load + train

### 10) Tiny real smoke path

1. Use a **real** frozen dir whose `train.jsonl` rows all have valid `sessions` rows + non-empty frames (not the synthetic toy split with fake `session_id`).
2. `uv run labos-training prepare-judgment-sft ... --out-dir outputs/smoke_prep`
3. `uv run labos-training train-judgment-sft --train ...\sft_train.jsonl --data-root ...\data --output outputs/smoke_sft --max-steps 2`
4. Confirm `outputs/smoke_prep/dataset-manifest.json` and `outputs/smoke_sft/run-manifest.json` exist and checkpoints landed under `outputs/smoke_sft/`.

---

## How to run

See `docs/runbooks/training.md` and `services/training/README.md`.

## Manual verification steps

1. `prepare-judgment-sft` on a real freeze → inspect `dataset-manifest.json` fields above.
2. Confirm `test.jsonl` unchanged / never read by prepare.
3. `train-judgment-sft` with `--max-steps 2` → inspect `run-manifest.json` versions + argv.
4. Confirm train refuses CPU and refuses `--batch-size 2`.
5. After TASK-0010 baseline exists, plan comparison runs **outside** this training command.

## Notes

- Pinning: **`run-manifest.json` + `uv.lock`** together are the provenance story; manifests duplicate resolved versions for audit portability.
