# Runbook: Isaac Lab Bridge

This bridge exports a LabOS session manifest into a portable Isaac Lab task spec. It does not run Isaac Sim locally; the output is a contract for a future GPU worker.

## Purpose

Use this path when LabOS capture artifacts need to seed synthetic rollouts, counterfactuals, or future robot/cobot policy work.

The bridge keeps three boundaries clear:

- LabOS recordings remain the real-world source of truth.
- Isaac Lab task specs describe simulated environment, observations, rewards, and reset conditions.
- Simulated success is not treated as proof of real glasses workflow adherence.

## Export

From `services/training`:

```powershell
uv run labos-export-isaac-lab `
  --manifest ..\..\reports\contract\kitchen_tea_latest\20260502-contract-smoke-v2\manifest.json `
  --out ..\..\reports\isaac_lab\kitchen-tea-v1\isaac_lab_task_spec.json
```

## Smoke Test

```powershell
cd services\training
uv run python tests\isaac_lab_smoke.py
```

Expected output:

```text
[isaac_lab_smoke] all checks passed
```

## Current Artifact

- `reports/isaac_lab/kitchen-tea-v1/isaac_lab_task_spec.json`

The task spec includes protocol steps, required objects, observation sources, reward terms, reset conditions, and sim-to-real caveats.
