# Post-SFT inference (HF + PEFT, not LM Studio)

This runbook covers the **bridge between TASK-0011 SFT outputs and TASK-0008 / TASK-0010 evaluation**: running the **same judgment task** as `POST /judgments`, but with a **local Hugging Face + LoRA adapter** instead of LM Studio.

## Boundary: LM Studio vs HF path

| Path | Role | Artifacts |
| --- | --- | --- |
| **LM Studio** | Default **baseline** inference in the demo | GGUF / LM Studio model id string stored in `judgments.model_id` |
| **HF + PEFT** (`labos-training infer-hf-judgments`) | **Post-SFT** or ablation inference for comparison | Adapter directory from `labos-training train-judgment-sft`; **you choose** a distinct `--judgment-model-id` for SQLite |

**LM Studio does not load** arbitrary Hugging Face PEFT adapter folders produced by this repo. For apples-to-apples *serving* in LM Studio you would need a **separate merge/export to GGUF** pipeline (out of scope here).

## What the command does

1. Reads a **frozen split JSONL** (`test.jsonl`, `val.jsonl`, or `train.jsonl`) in the TASK-0009 label format.
2. For each row: resolves clip + step in SQLite, selects frames with **`select_frames_for_clip`**, builds prompts with **`build_step_prompt`** (same strings as the API).
3. Loads **`AutoProcessor` from the adapter directory** (saved during SFT) and **`AutoModelForVision2Seq` + `PeftModel`** from `--adapter-dir` / `adapter_config.json` / `run-manifest.json`.
4. Generates text, parses with **`parse_strict_json` + `validate_judgment`** (same contract as the API).
5. Inserts into **`judgments`** via **`judgment_repository.insert_judgment`** with **`model_id = --judgment-model-id`**.

Eval harnesses pick the **latest** judgment per `clip_id`; a unique `model_id` is how you keep baseline vs post-SFT runs **provenance-safe**.

## Prerequisites

- CUDA GPU (same practical requirement as SFT).
- `uv sync --python 3.12 --extra gpu` in `services/training`.
- Valid SQLite + `data/` layout (same as API).
- SFT output directory containing adapter weights **and** the saved processor.

## Command

Preferred (matches prepare/train ergonomics): **`--frozen-dir`** + **`--split`** (`train`, `val`, or `test` → `<split>.jsonl` under that directory).

```bash
cd services/training
uv run labos-training infer-hf-judgments ^
  --frozen-dir ..\..\data\splits\<dataset>\<freeze_id> ^
  --split test ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --data-root ..\..\data ^
  --adapter-dir outputs\<run>_sft ^
  --judgment-model-id "hf-sft:outputs/<run>_sft:Qwen/Qwen3.5-9B"
```

Alternative: pass an explicit path with **`--split-jsonl`** (do not combine with `--frozen-dir` / `--split`).

Smoke debugging: **`--show-raw-on-parse-fail`** logs decoded model text when JSON parsing or schema validation fails (stderr).

Model outputs are normalized before validation (shared with `POST /judgments`): e.g. `judgment_schema_version` **`v1` → `1`**, list-wrapped **`action_detected` / `possible_issue`** coerced to the first valid closed-vocab token (see `labos_api.services.judgment_parsing.normalize_judgment_dict`).

Smoke / dry run:

```bash
uv run labos-training infer-hf-judgments ^
  --frozen-dir ..\..\data\splits\<dataset>\<freeze_id> ^
  --split test ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --data-root ..\..\data ^
  --adapter-dir outputs\<run>_sft ^
  --judgment-model-id "<unique-smoke-id>" ^
  --limit 2 ^
  --dry-run
```

## Manifest

Writes a run manifest next to the adapter dir.

- **Default**: `infer_manifest.json`
- **If `infer_manifest.json` already exists**: writes `infer_manifest_<timestamp>.json` (does **not** overwrite)
- **Override**: `--manifest-out <path>`

The manifest includes resolved **`split_jsonl`**, **`split_input_mode`** (`frozen_dir` or `split_jsonl`), and when applicable **`frozen_dir`** + **`split_name`**, plus sqlite path, adapter dir, base model, `judgment_model_id`, **`labos_judgment_max_frames`** (from `LABOS_JUDGMENT_MAX_FRAMES`, same as API), argv, and counts (`ok`, `parse_fail`, `step_mismatch`, `frame_error`, `skipped`). Each inserted row also carries **`judgment_schema_version`** inside the parsed result (same as API inserts).

## After inference

1. Run **`labos-eval-metrics judgments`** on the same split JSONL with the SQLite DB.
2. Optionally package a **TASK-0010**-style baseline report **after** you understand which `model_id` filter you want (today’s harness uses latest row per clip; design your comparison accordingly).

If you want to avoid the “latest row per clip_id” behavior, pass:

```bash
cd services/eval
uv run labos-eval-metrics judgments ^
  --dataset ..\..\data\splits\<dataset>\<freeze_id>\test.jsonl ^
  --sqlite ..\..\apps\api\var\labos_sessions.sqlite ^
  --out ..\..\reports\post-sft\<dataset>\<freeze_id>\smoke ^
  --required-model-id "<your-judgment-model-id>"
```

## Next tasks (not here)

- **TASK-0012 (GRPO)** — preference optimization; only after this bridge is exercised.
- **TASK-0013** — consolidated comparison report.
