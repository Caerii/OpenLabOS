# OpenLabOS ROI backlog (Top 100)

Master tracker for the [Top-100 ROI plan](roi-plan-reference.md). Status values:
`planned`, `in_progress`, `done`, `deferred`.

| Gate | Description |
|------|-------------|
| G1 | Compose smoke + protocol-run CI |
| G2 | Sessions/evidence survive restart |
| G3 | API/schema compatibility policy |
| G4 | Auth for network deployment |
| G5 | Install/rollback all platforms |

## Phase 0 — Program setup

| ID | Item | Gate | Status | Owner |
|----|------|------|--------|-------|
| P0-1 | Master backlog doc (`roi-backlog.md`) | — | done | — |
| P0-2 | Beta gates encoded in CI | G1,G2 | done | — |
| P0-3 | ADR status + implementation pointers | — | done | — |

## Phase 1 — Credible beta loop (1–20)

| ID | Item | Gate | Status | Primary files |
|----|------|------|--------|---------------|
| 1 | Persist Hono sessions across restarts | G2 | done | `services/api/src/core/sessions/sqlite-store.ts` |
| 2 | Compose protocol-run E2E → manifest | G1 | done | `scripts/compose-protocol-run.mjs` |
| 3 | Dependency-aware `/api/readyz` | G1 | done | `services/api/src/hono/routes/health.ts` |
| 4 | Unify kitchen loop with Hono sessions | G2 | done | `services/api/src/bridge/kitchen-to-session.ts` |
| 5 | Canonical storage + migration | G2 | done | `services/api/src/storage/repository.ts` |
| 6 | Browser tests for guided-run UX | G1 | done | `apps/web/tests/` |
| 7 | Visible judgment source in Operate UI | — | done | `KitchenInstrumentationDrawer.tsx` |
| 8 | Interrupted-run recovery/resume | G2 | done | `services/api/src/hono/routes/sessions.ts` |
| 9 | Durable run index | G2 | done | `services/api/src/hono/routes/runs.ts` |
| 10 | Evidence integrity metadata | G2 | done | `services/api/src/core/sessions/integrity.ts` |
| 11 | Run export/import bundle | G2 | done | `services/api/src/hono/routes/runs.ts` |
| 12 | First-success walkthrough | — | done | `docs/runbooks/first-successful-run.md` |
| 13 | API core Vitest in CI | G1 | done | `.github/workflows/check.yml` |
| 14 | Inference pytest in CI | G1 | done | `.github/workflows/check.yml` |
| 15 | Preview tests in CI | G1 | done | `.github/workflows/check.yml` |
| 16 | Operator dependency status panel | — | done | `DependencyStatusPanel.tsx` |
| 17 | Graceful API shutdown | G2 | done | `services/api/src/index.ts` |
| 18 | Actionable protocol validation errors | — | done | `services/api/src/hono/validation.ts` |
| 19 | Idempotency for events/judgments | G2 | done | `services/api/src/core/sessions/idempotency.ts` |
| 20 | Run-level audit timeline | G2 | done | `RunAuditTimeline.tsx` |

## Phase 2 — Cohesion and evidence (21–45)

| ID | Item | Gate | Status |
|----|------|------|--------|
| 21 | Automatic run checkpointing | G2 | done |
| 22 | Resume latest run action | G2 | done |
| 23 | Default workflow decision (operate canonical) | — | done |
| 24 | Migrate high-traffic routes to Hono | G3 | in_progress |
| 25 | Generate TS SDK from OpenAPI | G3 | done |
| 26 | Cross-service contract tests | G3 | done |
| 27 | Version compatibility policy | G3 | done |
| 28 | Protocol schema migration tooling | G3 | done |
| 29 | Evidence validation before attach | G2 | done |
| 30 | Sidecar retry/backoff/circuit breaker | — | done |
| 31 | Visible degraded mode banner | — | done |
| 32 | Startup provider config validation | — | done |
| 33 | Health failure-state tests | G1 | done |
| 34 | Volume backup/restore runbook | G2 | done |
| 35 | Automated volume export | G2 | done |
| 36 | Data retention and deletion | G2 | done |
| 37 | Demo reset command | — | done |
| 38 | Deterministic demo fixtures | G1 | done |
| 39 | Three protocol templates | — | done |
| 40 | Searchable protocol catalogue | — | done |
| 41 | Run comparison across attempts | — | planned |
| 42 | Run outcome metrics | — | done |
| 43 | Structured flag-issue workflow | — | done |
| 44 | Flagged issues → eval datasets | — | planned |
| 45 | Capability matrix doc | — | done |

## Phase 3 — Trust and security (46–60)

| ID | Item | Gate | Status |
|----|------|------|--------|
| 46 | Auth before non-loopback bind | G4 | done |
| 47 | TLS reverse-proxy guide | G4 | done |
| 48 | Rate limits and request size policy | G4 | done |
| 49 | Restrict perception imageUrl (SSRF) | G4 | done |
| 50 | Require segmentation token off-loopback | G4 | done |
| 51 | Secrets scanning in CI | G4 | done |
| 52 | Dependabot Node + Python | — | done |
| 53 | Dependency vulnerability scanning | — | done |
| 54 | Container image scanning (Trivy) | — | done |
| 55 | SBOM generation | — | done |
| 56 | Harden API container read-only | G4 | done |
| 57 | Compose CPU/memory limits | — | done |
| 58 | Image provenance labels | — | done |
| 59 | Threat model document | G4 | done |
| 60 | Consent/retention notices in capture UI | G4 | done |

## Phase 4 — Engineering quality (61–80)

| ID | Item | Status |
|----|------|--------|
| 61 | `pnpm lint` in CI | done |
| 62 | Replace placeholder test scripts | done |
| 63 | Web unit tests | done |
| 64 | Playwright smoke `/operate/kitchen` | done |
| 65 | Visual regression guided-run | planned |
| 66 | Coverage reporting | done |
| 67 | Coverage ratchet on changed files | planned |
| 68 | CI jobs training/eval/voice/inference | done |
| 69 | CI caching and sharding | done |
| 70 | Local preflight command | done |
| 71 | Consolidate API test runners | done |
| 72 | CI doc command smoke | done |
| 73 | Compose doc drift check | done |
| 74 | Refresh stale architecture docs | done |
| 75 | Legacy removal roadmap dates | done |
| 76 | Architecture tests no new legacy deps | done |
| 77 | ADR status fields | done |
| 78 | Release notes automation | planned |
| 79 | PR label changelog mapping | planned |
| 80 | Contributor templates | done |

## Phase 5 — Learning plane (81–90)

| ID | Item | Status |
|----|------|--------|
| 81 | Implement training TODO(openlabos) helpers | done |
| 82 | Real protocol type regeneration | done |
| 83 | Frozen versioned demo eval dataset | done |
| 84 | Reference run → export → eval pipeline | done |
| 85 | Baseline evaluator metrics per protocol | done |
| 86 | Model/provider version on judgments | done |
| 87 | Regression replay corpus | done |
| 88 | Offline replay against new provider | done |
| 89 | Human-review annotation workflow | planned |
| 90 | Calibration view model vs reviewer | planned |

## Phase 6 — Hardware and platform (91–100)

| ID | Item | Status |
|----|------|--------|
| 91 | Minimal webcam adapter | done |
| 92 | WebRTC preview bridge | in_progress |
| 93 | Serial device adapter | planned |
| 94 | ROS 2 adapter | planned |
| 95 | Grounded SAM 2 GPU Compose profile | done |
| 96 | OpenTelemetry tracing | done |
| 97 | Prometheus metrics + dashboard | planned |
| 98 | Structured JSON logging + correlation IDs | done |
| 99 | Publish versioned container images | done |
| 100 | Signed desktop/device release channels | planned |

## Wave execution order

1. **Wave A:** 1, 2, 3, 7, 12, 13–17, 23, 34–37, 45, 61, 70, 80
2. **Wave B:** 4, 5, 8–11, 18–20, 22, 25, 30–31, 6, 64
3. **Wave C:** 24, 27, 46, 49–53, 56, 59, 62–63, 68, 81–84, 87
4. **Wave D:** 91–100 and remaining polish
