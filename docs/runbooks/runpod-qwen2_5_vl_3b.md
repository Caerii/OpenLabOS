# RunPod runbook: Qwen2.5-VL-3B (SFT -> DPO -> GRPO)

This is a demo-grade guide to run the LabOS training loop on RunPod.

## 0) Choose a GPU

- **SFT / DPO (QLoRA, 3B):** start with **24GB** if cost matters; prefer **48GB** if you want fewer OOM surprises.
- **GRPO:** plan for **80GB** (A100-80G) for a smooth first run. The GRPO loop samples multiple completions per prompt, so memory pressure is higher than SFT.

## 1) Start a pod

Use a PyTorch/CUDA base image (or RunPod's recommended template). You need:

- Python 3.12
- Git

## 2) Get the repos

```bash
git clone <your-openlabos-training-repo-url>
git clone <your-OpenLabOS-repo-url>
```

## 3) Bring in capture artifacts

From your local workstation (where LabOS dashboard ran and wrote data):

- `OpenLabOS/dashboard/data/kitchen/run_events.jsonl`
- `OpenLabOS/dashboard/data/kitchen/frames/*.jpg`

Copy them to the pod (any method is fine: `scp`, RunPod volume, S3, etc).

Inside `openlabos-training`, place them here:

- `data/raw/openlabos-runs/kitchen/run_events.jsonl`
- `data/raw/openlabos-runs/kitchen/frames/*.jpg`

If you already have `OpenLabOS/dashboard/data` locally, you can use the importer:

```bash
python scripts/import_labos_data.py --labos-data "/path/to/OpenLabOS/dashboard/data"
```

## 4) Install training deps

```bash
cd openlabos-training/services/training
uv sync --python 3.12 --extra gpu
```

## 5) Build the SFT dataset

```bash
uv run labos-build-sft \
  --dashboard-data ../../data/raw/openlabos-runs \
  --out ../../data/processed/sft-kitchen.jsonl
```

## 6) SFT

```bash
uv run labos-train-sft \
  --dataset ../../data/processed/sft-kitchen.jsonl \
  --model Qwen/Qwen2.5-VL-3B-Instruct \
  --output ../../data/processed/checkpoints/sft-qwen2_5_vl_3b
```

## 7) DPO

You will need a DPO dataset with `chosen/rejected`. For the demo, the quickest way is:

- `chosen`: a human-verified judgment JSON
- `rejected`: the baseline model output

Then:

```bash
uv run labos-train-dpo \
  --dataset ../../data/processed/dpo-kitchen.jsonl \
  --model Qwen/Qwen2.5-VL-3B-Instruct \
  --output ../../data/processed/checkpoints/dpo-qwen2_5_vl_3b
```

## 8) GRPO

```bash
uv run labos-train-grpo \
  --train ../../data/processed/sft-kitchen.jsonl \
  --data-root ../../data \
  --model Qwen/Qwen2.5-VL-3B-Instruct \
  --output ../../data/processed/checkpoints/grpo-qwen2_5_vl_3b \
  --num-generations 4 \
  --max-new-tokens 256 \
  --kl-beta 0.0
```

If you want KL regularization against a frozen reference model, raise `--kl-beta` and budget more VRAM.

## 9) Re-eval

Use the eval harness to generate "before/after" artifacts:

```bash
cd ../eval
uv sync --python 3.12
uv run labos-eval-metrics \
  --events ../../data/raw/openlabos-runs/kitchen/run_events.jsonl \
  --out ../../docs/eval/baseline
```

After training, repeat with a new `run_events.jsonl` produced by running inference with the fine-tuned model.
