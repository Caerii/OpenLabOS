# Train a step-checking adapter

Fine-tune a vision model to return the same structured step result used by the
API. This page covers supervised fine-tuning and the local sampled-reward
training path.

## What you are training

- **Task**: Produce the API's structured JSON step result. Structured fields
  are authoritative; `reason` is explanatory.
- **Inputs**: Up to **N** frames per clip (`LABOS_JUDGMENT_MAX_FRAMES`, default **8**), selected **deterministically** the same way as the API (`select_frames_for_clip`: list `processed/<session_id>/frames/<clip_id>/`, sort by filename, take first N).
- **Prompt (frozen at prepare time)**: `prepare-judgment-sft` calls **`build_step_prompt`** once per row and writes `system` + `user_text` into JSONL. **Training never re-runs** the prompt builder; it only tokenizes those frozen strings plus frames. Multimodal **transport** still differs (API: base64 data URLs; training: PIL tensors).

## What you are not training

- Not a general “lab assistant.”
- Not the legacy `verify_step` dataset (`openlabos-build-sft` remains separate).
- **No in-loop evaluation**: after training, compare adapters with
  `openlabos-eval-metrics` against the frozen split and stored judgments.

## Prerequisites

- **Python 3.12** and `uv` (see `services/training/.python-version`).
- **CUDA GPU** (judgment SFT targets a single local GPU path, e.g. RTX 3080 10GB). CPU training is refused with a clear error.
- **Frozen dataset** under `data/splits/<dataset>/<freeze_id>/` with
  `train.jsonl` and, when available, `val.jsonl`; see
  `docs/eval/dataset-spec.md`.
- **Session data** from the API data root. Legacy workflows may also require
  `services/api/var/labos_sessions.sqlite`.
- **Frames on disk** under `data/` for every clip in the split (same paths the API would read).

## Install

```bash
cd services/training
uv sync --python 3.12 --extra gpu
```

`services/training/pyproject.toml` pins `torch==2.6.0` to the explicit
`pytorch-cu124` index, so this sync resolves a CUDA build instead of the CPU
wheel.

The training package shares prompt and frame-selection helpers with the API.

## CLI: `openlabos-training`

### 1) Prepare SFT JSONL

Writes an explicit machine-readable bundle:

- `sft_train.jsonl` / `sft_val.jsonl` (if `val.jsonl` exists in the freeze)
- `dataset-manifest.json` (paths, counts, frame policy, schema version, `labos-api` package version, explicit **test split excluded** note, small-dataset warning)

```bash
uv run openlabos-training prepare-judgment-sft ^
  --frozen-dir ..\..\data\splits\<dataset>\<freeze_id> ^
  --sqlite ..\..\services\api\var\labos_sessions.sqlite ^
  --out-dir outputs\<run_name>_prep
```

Optional flags:

- `--data-root` — defaults from `LABOS_DATA_ROOT` or inferred repo `data/` when `--frozen-dir` is under `.../data/splits/...`.
- `--protocol-path` — defaults from `LABOS_PROTOCOL_PATH` or the example
  protocol under `examples/protocols/`.

**Failure modes** (fail fast):

- Missing `train.jsonl`, missing SQLite, unknown `session_id`, protocol load mismatch, missing or **empty** frames directory, empty split.

### 2) Train LoRA

Default stack: **`Qwen/Qwen3.5-9B`**, **4-bit** weights, **LoRA** on MLP + attention linear projections, **`per_device_train_batch_size=1`** (**current collator limitation**, not a universal law). Use **`Qwen/Qwen2.5-VL-3B-Instruct`** only for cheaper smoke checks.

```bash
uv run openlabos-training train-judgment-sft ^
  --train outputs\<run_name>_prep\sft_train.jsonl ^
  --val outputs\<run_name>_prep\sft_val.jsonl ^
  --data-root ..\..\data ^
  --output outputs\<run_name>_sft ^
  --bf16
```

Artifacts under `--output`:

- `run-manifest.json` — full `argv`, best-effort `git_commit`, **pinned** library versions (`torch`, `transformers`, `peft`, `trl`, `accelerate`, `bitsandbytes`, `datasets`), base/processor ids, LoRA + quant flags, `max_frames_env`, trainer note (`transformers.Trainer` vs TRL `SFTTrainer`), prepared-row contract, target JSON serialization note, `confidence` convention.
- Adapter weights + processor saved by Hugging Face / PEFT (`save_pretrained` on the run directory).

**Early failures:** CUDA, bad `--val` path, unreadable JSONL, and processor/model load errors are checked **before** a long train.

**VRAM / OOM**: Prefer defaults (`--use-4bit` on by default). Fallbacks: `--no-use-4bit`; `--max-length 0` (no truncation, VL-safer, more VRAM); lower `LABOS_JUDGMENT_MAX_FRAMES` and **re-run prepare**; larger GPU or AWS (no in-repo launcher).

**bf16:** optional on Ampere; if unstable, **drop `--bf16`** for fp16 (`TrainingArguments.fp16`).

**Serving vs training**: LM Studio serves the base (or merged) model with its own runtime. This repo trains with **transformers + PEFT**. Treat checkpoints as **HF-compatible adapters** unless you add an explicit merge/export step for your server.

### 3) Post-SFT judgments (HF + PEFT, not LM Studio)

After SFT, run the same task contract as the API with
`openlabos-training infer-hf-judgments`. Give each adapter a distinct
`--judgment-model-id` so the evaluation output can distinguish it from the
baseline.

Full operator steps: **`docs/runbooks/post-sft-inference.md`**. Typical invocation uses **`--frozen-dir`** and **`--split`** (`train` / `val` / `test`) instead of spelling out `test.jsonl`.

### 4) GRPO sampled reward loop

`openlabos-training train-grpo` samples several answers for each prompt, scores
them against the frozen target, and updates the LoRA policy.

```bash
uv run openlabos-training train-grpo ^
  --train outputs\<run_name>_prep\sft_train.jsonl ^
  --val outputs\<run_name>_prep\sft_val.jsonl ^
  --data-root ..\..\data ^
  --output outputs\<run_name>_grpo ^
  --num-generations 4 ^
  --max-new-tokens 256 ^
  --kl-beta 0.0
```

Notes:

- `--num-generations` must be at least 2.
- Keep `--batch-size 1`.
- Set `--kl-beta` above zero only when you have the GPU memory for a frozen reference model.
- The reward is local and inspectable; it prioritizes JSON validity, step id, step completion, action, issue, and object overlap.

## AWS / bigger iron

There is **no** cloud job launcher in-repo. If the local GPU is insufficient, copy:

- `sft_train.jsonl` / `dataset-manifest.json`
- the same `openlabos-training train-judgment-sft ...` command

to a GPU host or managed notebook, keeping `data/` and SQLite conventions consistent.

## Legacy commands

Older scaffolds remain for dashboard-era JSON:

- `labos-build-sft`, `labos-train-sft` — **not** the judgment freeze pipeline.

## See also

- `services/training/README.md` — purpose, assumptions, output layout.
- `docs/runbooks/post-sft-inference.md` — HF + PEFT judgment loop after SFT.
- `docs/verification/TASK-0011-sft-training.md` contains the original
  implementation verification notes.
- `docs/verification/post-sft-inference-integration.md` — integration scope and manual checks.
- `docs/eval/dataset-spec.md` — label JSONL contract (unchanged by training).
