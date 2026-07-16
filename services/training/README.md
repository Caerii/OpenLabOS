# services/training — OpenLabOS training stack

This service is the Python (uv-managed) ML training stack for OpenLabOS. It
hosts SFT, DPO, GRPO, and judgment LoRA training, along with dataset ingestion
utilities for video sources.

The service consumes **RunManifests** produced by `services/api` (TypeScript).
Manifests pin the protocol JSON, the SQLite path, frozen split locations, and
the data-root layout that training reads.

## Bootstrap

```bash
cd services/training
uv sync --python 3.12 --extra gpu
```

`pyproject.toml` pins `torch==2.6.0` to the explicit `pytorch-cu124` index, so
this resolves a CUDA wheel rather than the CPU build. Drop `--extra gpu` if you
do not need bitsandbytes.

## Protocol types

OpenLabOS keeps the canonical protocol/judgment schemas in
`packages/protocol/schema/*.json`. The training service regenerates Python
types from those schemas with `datamodel-code-generator` instead of importing
from `services/api` (which is TypeScript).

Run the codegen helper:

```bash
uv run python scripts/regenerate-protocol-types.py
```

This writes `openlabos_training/_generated_protocol.py`. Several modules
currently have TODO stubs (search the package for `TODO(openlabos)`) marking
the symbols that should be sourced from the generated module once available.

## CLI scripts

All scripts ship as `[project.scripts]` entrypoints in `pyproject.toml`. The
Python module paths are unchanged from the upstream port (`openlabos_training.*`);
only the CLI names use the `openlabos-` prefix.

| Script | Purpose |
| --- | --- |
| `openlabos-train-sft` | Legacy QLoRA SFT trainer for verify_step JSONL produced by `openlabos-build-sft`. |
| `openlabos-train-dpo` | DPO training scaffold for chosen/rejected pairs from `openlabos-collect-dpo`. |
| `openlabos-train-grpo` | Group-relative policy optimization for the judgment task; samples N candidates per prompt and updates LoRA via group-relative advantages. |
| `openlabos-train-judgment-sft` | LoRA SFT on prepared judgment JSONL (frozen `system` / `user_text` / `image_rel_paths` / `target_json`). |
| `openlabos-build-sft` | Builds legacy SFT JSONL from dashboard `run_events.jsonl` (verify_step path). |
| `openlabos-collect-dpo` | Collects teacher-vs-student preference pairs (DPO chosen/rejected) for the judgment task. |
| `openlabos-ingest-youtube` | Thin wrapper around `openlabos-ingest-video-sources` for backwards compatibility. |
| `openlabos-ingest-video-sources` | Acquires videos (YouTube via yt-dlp or local files), splits into clips, extracts frame samples, and emits `sources.jsonl` / `samples.jsonl` / `frames.jsonl`. |
| `openlabos-prepare-judgment-sft` | Reads frozen `train.jsonl` (and optional `val.jsonl`), renders the system / user prompts, selects frames, and writes the SFT JSONL plus a `dataset-manifest.json`. |
| `openlabos-infer-hf-judgments` | Runs HF + PEFT (post-SFT) judgments against a frozen split, writing rows to SQLite under a caller-chosen `model_id` so eval can distinguish them from baselines. |
| `openlabos-export-isaac-lab` | Exports a session manifest into a portable Isaac Lab task spec (no Isaac Lab runtime dependency). |

## How this fits with `services/api`

`services/api` (TypeScript) is the source of truth for the running protocol
state, owns the SQLite database, and emits per-run **RunManifest** JSON. This
training service treats those manifests as inputs:

- frozen splits live under `data/splits/<dataset>/<freeze_id>/` exactly as the
  API records them
- the API SQLite (`services/api/var/openlabos_sessions.sqlite` by default) is
  consulted read-only to map `session_id` → `protocol_id`
- judgment writes from `openlabos-infer-hf-judgments` use the same `judgments`
  schema the API exposes, but with a unique `model_id` so post-SFT runs do
  not collide with the LM Studio baseline

Until `scripts/regenerate-protocol-types.py` is wired up, the cross-stack types
that used to come from `labos_api` are temporarily stubbed locally and clearly
marked with `TODO(openlabos)` comments.
