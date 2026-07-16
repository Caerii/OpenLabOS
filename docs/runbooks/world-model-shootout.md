# World-model 3-stack shootout

Phase 0 benchmark harness for comparing Stack A (memory), Stack B (semantic GS), and Stack C (feed-forward 3D) on real `KitchenSessionManifest` files — no GPU required for the first pass.

## Prerequisites

- Python 3.12 via `uv` in `services/training`
- Kitchen manifests under `services/api/data/kitchen/manifests/` (tests + real runs)
- Optional: `data-root` pointing at `services/api/data` when manifests reference `kitchen/frames/*`

## Quick start

From repo root:

```bash
cd services/training
uv sync
uv run openlabos-world-model-shootout \
  --manifest-dir ../api/data/kitchen/manifests \
  --data-root ../api/data \
  --label phase0-smoke
```

Outputs:

- `services/training/artifacts/world-model-shootout/<label>-<timestamp>.json` — full report
- Console summary with per-stack weighted scores

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--manifest-dir` | required | Directory of `*.json` manifests |
| `--data-root` | `""` | Resolves `frames.frameRef` paths (`dashboard/data` root) |
| `--run-ids` | all | Comma-separated filter |
| `--label` | `shootout` | Report label |
| `--phase` | `0` | `0` = structural only; `1` adds retrieval scoring |
| `--stacks` | `a,b,c` | Subset: `a` memory, `b` gsplat, `c` feedforward |
| `--dry-run` | off | List manifests and queries only |

## Phase 0 interpretation

Phase 0 does **not** run WildGS, CUT3R, or Graphiti. It measures:

1. **Manifest join integrity** — required keys present for memory/reconstruction ingest
2. **Media coverage** — fraction of `frameRefs` / `chunkRefs` that resolve on disk
3. **Step localization** — stack can return the correct `stepNumber` for generated queries
4. **Evidence recall@k** — retrieved refs overlap gold `frameRefs` for a step
5. **Ingest latency** — Python ingest shim time (proxy for orchestration cost)

Use Phase 0 to pick which manifests are shootout-ready before reserving GPU time.

## Phase 1 (retrieval backends)

Enable optional backends via env:

```bash
# Stack A: CLIP text-image scoring (downloads model on first run)
export OPENLABOS_STACK_A_CLIP=1

uv run openlabos-world-model-shootout --phase 1 ...
```

Phase 1 adds `query_latency_p95_ms` and embedding-based evidence ranking when CLIP is available.

## Phase 2 (GPU sidecars)

Not automated in-repo yet. Manual procedure:

1. Export bundle: `tsx services/api/src/scripts/export-kitchen-session-bundle.ts --manifest <path> --out /tmp/bundle`
2. Run stack worker on GPU host (WildGS / CUT3R / LEGO-SLAM) on `bundle/media/`
3. Drop worker metrics JSON into `artifacts/world-model-shootout/manual/` and merge in spreadsheet

Target metrics: `novel_view_psnr`, `tracking_ate_rm`, `open_vocab_iou` (Stack B only).

## Query suite generation

The harness auto-builds queries from each manifest:

| Query type | Gold source |
|------------|-------------|
| `step_instruction` | `stepSegments[].stepInstruction` |
| `step_evidence` | `stepSegments[].frameRefs` / `chunkRefs` |
| `step_time_range` | `startedAt` / `endedAt` |
| `vqa_gold` | `vqaAnnotations[]` when present |

## Decision doc

See [world-model-stack-decision-matrix.md](../architecture/world-model-stack-decision-matrix.md) for library scores and the recommended phased rollout (A → C → optional B).
