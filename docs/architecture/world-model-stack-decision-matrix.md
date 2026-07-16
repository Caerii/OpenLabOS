# World-model stack decision matrix

Status: **proposed** (Phase 0 shootout scaffold landed; GPU backends are opt-in).

This document scores candidate libraries and three integrated stacks against OpenLabOS constraints for Mentra egocentric lab video: mono RGB, dynamic hands/tools, optional IMU, `KitchenSessionManifest` as the episode index, Windows dev with a GPU sidecar, and no ROS requirement.

## Constraints (hard vs soft)

| ID | Constraint | Weight | Rationale |
|----|------------|--------|-----------|
| C1 | Mono RGB only (no device depth) | Hard | Mentra preview path is MJPEG / rolling MP4 |
| C2 | Dynamic scenes (hands, tools, people) | Hard | Kitchen protocols are manipulation-heavy |
| C3 | Egocentric wearable capture | Hard | Glasses-mounted POV |
| C4 | `labos.kitchen.session-manifest.v1` join keys | Hard | `run.id`, `stepSegments.id`, `frames.frameRef`, `chunks.chunkRef` |
| C5 | Windows-friendly dev loop | Soft | API/web on Windows; GPU worker may be Linux/WSL2/RunPod |
| C6 | Sub-500 ms query latency (warm index) | Soft | Operator copilot, not batch analytics |
| C7 | Real-time ingest (≥3 fps effective) | Soft | 6 fps device target with sidecar headroom |
| C8 | Self-hostable / Apache-friendly | Soft | Local-first default (ADR 0006) |
| C9 | Open-vocabulary object/step queries | Soft | Closed-world protocols + open-vocab retrieval |
| C10 | Semantic 3D map export | Soft | Nice for `/operate` spatial UI later |

## Scoring rubric (1–5 per criterion)

| Score | Meaning |
|-------|---------|
| 5 | Production-ready for our constraint with minimal glue |
| 4 | Strong fit; one known gap (e.g. needs synthetic depth) |
| 3 | Usable with meaningful engineering |
| 2 | Research-grade or wrong sensor assumption |
| 1 | Poor fit for Mentra kitchen runs |

### Criteria columns

| Code | Criterion | What we measure |
|------|-----------|-----------------|
| M | Mono RGB | Works without RGB-D or LiDAR |
| D | Dynamic scenes | Handles moving hands/tools without map corruption |
| E | Egocentric | Designed or validated on ego video |
| Q | Queryable memory | ST-RAG, temporal KG, or semantic map queries |
| R | Real-time ingest | Online / streaming update path |
| W | Windows + GPU sidecar | Dev on Windows; inference on GPU worker |
| I | Manifest integration | Maps cleanly onto session manifest artifacts |
| O | Open / self-host | License and deployability |
| V | Maturity | Docs, community, reproducibility |
| G | GPU efficiency | VRAM and fps on 12–24 GB class GPUs |

## Library scorecard (representative)

Scores are editorial estimates for **Mentra kitchen mono RGB**; re-score after Phase 1 GPU runs.

| Library | M | D | E | Q | R | W | I | O | V | G | **Σ** |
|---------|---|---|---|---|---|---|---|---|---|---|-------|
| **Graphiti** | 5 | 4 | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | **45** |
| **LightRAG + VideoRAG** | 5 | 4 | 4 | 5 | 3 | 4 | 4 | 5 | 4 | 5 | **43** |
| **DimOS spatial memory** | 5 | 3 | 4 | 4 | 4 | 3 | 4 | 5 | 3 | 5 | **40** |
| **DirectMe / UCS-Bench** | 5 | 3 | 5 | 5 | 2 | 3 | 4 | 4 | 3 | 3 | **37** |
| **VL-MemKnG pattern** | 5 | 4 | 5 | 5 | 3 | 4 | 4 | 5 | 3 | 4 | **42** |
| **Chroma + CLIP** | 5 | 3 | 4 | 3 | 5 | 5 | 5 | 5 | 5 | 5 | **45** |
| **WildGS-SLAM** | 4 | 5 | 3 | 2 | 4 | 2 | 3 | 4 | 4 | 2 | **33** |
| **Flash-Mono** | 5 | 3 | 3 | 2 | 5 | 2 | 3 | 4 | 3 | 4 | **34** |
| **LEGO-SLAM** | 3 | 4 | 3 | 5 | 4 | 2 | 3 | 4 | 3 | 2 | **33** |
| **CUT3R** | 5 | 4 | 3 | 2 | 5 | 3 | 3 | 4 | 3 | 3 | **35** |
| **VGGT** | 5 | 3 | 3 | 2 | 4 | 3 | 3 | 4 | 4 | 3 | **34** |
| **Depth Anything V2** | 5 | 4 | 4 | 2 | 5 | 4 | 4 | 5 | 5 | 4 | **42** |
| **ORB-SLAM3** | 5 | 2 | 3 | 1 | 5 | 3 | 4 | 4 | 5 | 5 | **37** |
| **OpenVINS** | 5 | 2 | 3 | 1 | 5 | 2 | 3 | 4 | 4 | 5 | **34** |
| **Kimera / Hydra DSG** | 3 | 3 | 2 | 5 | 3 | 2 | 2 | 4 | 4 | 2 | **30** |
| **gsplat + nerfstudio** | 4 | 3 | 2 | 2 | 2 | 3 | 3 | 5 | 5 | 3 | **32** |
| **Rerun** | 5 | 5 | 5 | 2 | 5 | 5 | 5 | 5 | 5 | 5 | **47** |
| **probcomp/b3d** | 4 | 3 | 3 | 4 | 2 | 4 | 5 | 4 | 3 | 4 | **36** |

**Note:** Rerun is observability, not a memory/reconstruction engine — include in every stack, not as a competitor.

## Three stacks (integrated shootout candidates)

### Stack A — Spatiotemporal memory first

**Goal:** Queryable protocol memory in days, not weeks. Best product value per GPU hour.

| Layer | Choice |
|-------|--------|
| Episode index | `KitchenSessionManifest` (existing) |
| Vector index | ChromaDB or LanceDB |
| Temporal graph | Graphiti or LightRAG ST-KG layer |
| Embeddings | CLIP / SigLIP2 on `frames` + chunk keyframes |
| Pose glue | ORB-SLAM3 mono or OpenVINS when IMU exported |
| Viz | Rerun |

**Repos:** [graphiti](https://github.com/getzep/graphiti), [LightRAG](https://github.com/HKUDS/LightRAG), [dimensionalOS/dimos](https://github.com/dimensionalOS/dimos), [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) (optional depth tags).

| M | D | E | Q | R | W | I | O | V | G | **Σ** |
|---|---|---|---|---|---|---|---|---|---|-------|
| 5 | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 | **47** |

**Risks:** No photorealistic novel view; spatial answers are retrieval + graph, not true 3D.

---

### Stack B — Live semantic Gaussian map

**Goal:** Shared real-time splat map with open-vocabulary queries on the lab.

| Layer | Choice |
|-------|--------|
| SLAM | WildGS-SLAM (dynamic) → LEGO-SLAM (language features) |
| Raster | gsplat |
| Export / view | nerfstudio Splatfacto viewer or viser |
| Memory | LEGO 16D language features + manifest `stepSegments` |
| Sidecar | Linux GPU worker (CUDA 12.x) |

**Repos:** [WildGS-SLAM](https://wildgs-slam.github.io/), [LEGO-SLAM](https://github.com/Lab-of-AI-and-Robotics/LEGO-SLAM), [gsplat](https://github.com/nerfstudio-project/gsplat).

| M | D | E | Q | R | W | I | O | V | G | **Σ** |
|---|---|---|---|---|---|---|---|---|---|-------|
| 4 | 5 | 3 | 5 | 4 | 2 | 3 | 4 | 3 | 2 | **35** |

**Risks:** Highest engineering cost; Windows dev is orchestration-only; VRAM hungry; mono dynamic kitchen is active research.

---

### Stack C — Feed-forward persistent 3D state

**Goal:** Lowest iteration latency; persistent pointmap/state without per-frame GS optimization.

| Layer | Choice |
|-------|--------|
| Core | CUT3R recurrent state (or VGGT windows) |
| Depth prior | Depth Anything V2/V3 for scale hints |
| Splat optional | Offline gsplat fit on accumulated pointmap |
| Memory | VL-KnG-style chunk graph on manifest `chunks` |
| Pose | CUT3R trajectory or ORB-SLAM3 fallback |

**Repos:** [CUT3R](https://cut3r.github.io/), [VGGT](https://github.com/facebookresearch/vggt), [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2).

| M | D | E | Q | R | W | I | O | V | G | **Σ** |
|---|---|---|---|---|---|---|---|---|---|-------|
| 5 | 4 | 4 | 3 | 5 | 3 | 4 | 4 | 3 | 3 | **38** |

**Risks:** Weaker open-vocab map than Stack B; query layer still required (borrow from Stack A).

---

## Weighted recommendation (product phases)

| Phase | Deliverable | Stack |
|-------|-------------|-------|
| **0** (now) | Manifest shootout harness, query suite, structural metrics | All three (ingest-only) |
| **1** | `services/memory` — ST-RAG over runs | **A** |
| **2** | GPU sidecar ingest from rolling MP4 | **C** (live state) + **A** (queries) |
| **3** | Optional semantic splat viewer in `/operate` | **B** (if Phase 2 quality insufficient) |

**Default pick if only one stack:** **Stack A**, with **CUT3R depth sidecar** from Stack C and **gsplat export** from Stack B as optional modules.

## OpenLabOS service mapping (target)

```
KitchenSessionManifest
        │
        ├─► services/memory     (Stack A: index frames/chunks/events)
        │       ├─ vector store (Chroma/LanceDB)
        │       └─ temporal KG  (Graphiti or LightRAG)
        │
        └─► services/reconstruction  (Stack B/C GPU worker)
                ├─ stack: wildgs | cut3r | vggt
                └─ artifacts: splat.ply | pointmap | pose.json
```

### API contracts (proposed)

| Route | Purpose |
|-------|---------|
| `POST /api/memory/ingest` | Body: `{ runId }` — index manifest artifacts |
| `POST /api/memory/query` | Body: `{ runId, query, atTs? }` — ST-RAG |
| `GET /api/workspace/{runId}/reconstruction` | Status + artifact refs |
| `POST /api/reconstruction/ingest` | Start GPU job from `rollingEvidence` paths |

## Shootout metrics (Phase 0 → 2)

| Metric | Phase 0 (structural) | Phase 1 (retrieval) | Phase 2 (GPU) |
|--------|----------------------|---------------------|---------------|
| `manifest_join_integrity` | ✓ | ✓ | ✓ |
| `media_coverage_rate` | ✓ | ✓ | ✓ |
| `step_localization_accuracy` | ✓ | ✓ | ✓ |
| `evidence_recall_at_k` | ✓ | ✓ | ✓ |
| `ingest_latency_ms` | ✓ | ✓ | ✓ |
| `query_latency_p95_ms` | — | ✓ | ✓ |
| `temporal_consistency_score` | — | ✓ | ✓ |
| `novel_view_psnr` | — | — | ✓ (B/C) |
| `tracking_ate_rm` | — | — | ✓ (B/C) |
| `open_vocab_iou` | — | — | ✓ (B) |

Runbook: [world-model-shootout.md](../runbooks/world-model-shootout.md).

Harness: `services/training` → `openlabos-world-model-shootout`.
