# Demo runbook: LabOS full loop (OpenLabOS → metrics)

This is the minimal, repeatable flow to demonstrate:

- **Capture** (POV stream + protocol run)
- **Baseline** (metrics on the captured run)
- **Improvement loop scaffolding** (data import + evaluation artifacts)

## Prereqs

- HMD glasses reachable via **ADB or WiFi**.
- `OpenLabOS` dashboard running (Express + React).
- This repo (`openlabos-training`) checked out.

## Part 1: Capture (LabOS)

1) Start the dashboard server + UI.

2) Start camera preview streaming from the device.

3) In the **Kitchen Demo** panel:

- Select a protocol (3–5 steps is fine).
- Start the run.
- For each step:
  - perform the action
  - press **Verify Step** until it advances (or use Mark Done if needed)

1) Confirm artifacts were written by the dashboard:

- `OpenLabOS/dashboard/data/kitchen/run_events.jsonl`
- `OpenLabOS/dashboard/data/kitchen/frames/*.jpg`
- `OpenLabOS/dashboard/data/kitchen/current_run.json`

## Part 2: Baseline metrics (this repo)

From the root of `openlabos-training`:

1) Import the dashboard data:

```bash
python scripts/import_labos_data.py --labos-data "F:\\Github\\OpenLabOS\\OpenLabOS\\dashboard\\data"
```

1) Compute metrics:

```bash
cd services/eval
uv sync --python 3.12
uv run labos-eval-metrics --events "..\\..\\data\\raw\\openlabos-runs\\kitchen\\run_events.jsonl" --out "..\\..\\docs\\eval\\baseline"
```

1) Show the report artifacts:

- `docs/eval/baseline/kitchen-run-metrics.md`
- `docs/eval/baseline/kitchen-run-metrics.json`

## Part 3: “Improvement loop” placeholder (planned)

For the full SOW bar (fine-tune + re-eval), the next step is to produce a small supervised dataset and train a small open model (or later a VLM on cloud GPU). This repo already has ADRs for that direction:

- `docs/decisions/0012-vision-language-baseline.md`
- `docs/decisions/0013-adaptation-training-stack.md`

Once training scripts exist, this runbook should be extended with:

- frozen split creation (`data/splits/`)
- train command(s)
- post-train inference run + re-eval, producing `docs/eval/after/*`
