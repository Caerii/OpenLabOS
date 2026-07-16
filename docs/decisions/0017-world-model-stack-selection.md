# 0017 — World-model stack selection via 3-stack shootout

- Status: **proposed**
- Date: 2026-06
- Scope: Learning plane (`services/training`), future `services/memory` + `services/reconstruction`, kitchen manifests

## Context

OpenLabOS kitchen runs already produce rich episode artifacts (`KitchenSessionManifest`: frames, chunks, step segments, adherence, VQA). We want spatiotemporal memory and optional real-time 3D reconstruction from Mentra egocentric video (mono RGB, dynamic manipulation, ~6 fps).

Dozens of libraries cover GS-SLAM, feed-forward 3D, and agent memory. Committing to one monolith before measuring on our manifests risks months of GPU integration with weak operator value.

## Decision

1. **Adopt a phased stack strategy**, not a single library:
   - **Stack A (default):** spatiotemporal memory — manifest-indexed vectors + temporal KG (Graphiti / LightRAG patterns, DimOS-style spatial indexing).
   - **Stack C (second):** feed-forward persistent 3D state (CUT3R-class) for low-latency geometry sidecar.
   - **Stack B (optional):** semantic Gaussian SLAM (WildGS + LEGO-SLAM) only if splat-quality spatial UI is required.

2. **Run a 3-stack shootout** on real manifests using `openlabos-world-model-shootout` (Phase 0 structural metrics now; Phase 1 retrieval; Phase 2 manual GPU metrics).

3. **Place new capabilities** in future services, not `services/api`:
   - `services/memory` — ingest manifest, query ST-RAG
   - `services/reconstruction` — GPU worker for Stack B/C artifacts

4. **Use Rerun** for debug visualization across all stacks (not a competing memory engine).

## Consequences

**Easier**

- Fast operator value from Stack A on existing frames/chunks without CUDA SLAM.
- Clear go/no-go criteria before WildGS/LEGO integration.
- Manifest join keys remain the stable contract (`exportHints.stableJoinKeys`).

**Harder**

- Three codepaths to maintain during shootout (mitigated by shared manifest ingest).
- Stack B likely requires Linux GPU worker even if dev is on Windows.

**Forbidden**

- Blocking kitchen shipping on full GS-SLAM.
- Storing reconstruction state only inside `services/api` GPU paths (violates plane separation).

## Alternatives considered

| Alternative | Why not now |
|-------------|-------------|
| WildGS-only | High GPU cost; weak query/RAG story alone |
| DimOS fork wholesale | Robot SDK surface area; spatial memory pattern is the portable part |
| Kimera/Hydra only | ROS-heavy; worse egocentric wearable fit |
| Mem0-only | Strong personalization; weaker native temporal graph than Graphiti for protocol runs |

## References

- [World-model stack decision matrix](../architecture/world-model-stack-decision-matrix.md)
- [World-model shootout runbook](../runbooks/world-model-shootout.md)
- `services/api/src/ai/kitchen/session-manifest.ts`
