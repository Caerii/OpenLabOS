# Experience profiles: operator vs engineering

OpenLabOS ships as **one web app** with two experience profiles. Capabilities (what the backend does) are separate from surfaces (what the UI shows).

## Layers

| Layer | Source | Purpose |
|-------|--------|---------|
| **Capabilities** | `LabOSFeatureFlags` / env `LABOS_*` | Server behavior: supervisor, VQA, adaptive preview, etc. |
| **Profile** | `LABOS_EXPERIENCE_PROFILE` | Who the UI is for: `operator` or `engineering` |
| **Surfaces** | Derived + `LABOS_SURFACE_*` overrides | Which UI modules mount |

## Profiles

### Operator (default)

- **Env:** `LABOS_EXPERIENCE_PROFILE=operator` (default)
- **Nav:** Run (kitchen), Camera, Runs (files)
- **Copy:** Plain language via `operatorStatus.ts` — no frame bytes or pipeline jargon in primary UI
- **Effective flags:** Experimental capabilities are **stripped** even if enabled in env (`effectiveFeatureFlagsForExperience`)
- **Kitchen:** Fix-next panel, runway preflight, focus layout during run

### Engineering

- **Env:** `LABOS_EXPERIENCE_PROFILE=engineering` (alias: `LABOS_EXPERIENCE_MODE=experimental`)
- **Nav:** Full sidebar + Preview Lab when perf lab surface is on
- **Tools:** DevPanel, maintenance actions, instrumentation drawer, camera plots
- **Effective flags:** Match configured `flags` — full stack available

### Auto

- **Env:** `LABOS_EXPERIENCE_PROFILE=auto`
- **Default:** Resolves to **operator** profile and operator surfaces
- **Engineering auto:** Set `LABOS_ALLOW_ENGINEERING_AUTO=true` **and** enable at least one experiment flag → profile becomes `engineering`

This prevents accidental UI expansion when backend flags are left on in shared environments.

## Environment variables

### Profile

| Variable | Values | Default |
|----------|--------|---------|
| `LABOS_EXPERIENCE_PROFILE` | `operator`, `engineering`, `auto` | `operator` |
| `LABOS_EXPERIENCE_MODE` | Deprecated alias; `experimental` → `engineering` | — |
| `LABOS_ALLOW_ENGINEERING_AUTO` | `true` / `false` | `false` |

### Capability flags (existing)

See `services/api/src/config/features.ts` — `LABOS_PROTOCOL_MODE`, `LABOS_REALTIME_SUPERVISOR_ENABLED`, etc.

### Surface overrides (engineering only)

| Variable | Default in engineering |
|----------|------------------------|
| `LABOS_SURFACE_PERF_LAB` | `true` if `adaptivePreviewEnabled`, else env |
| `LABOS_SURFACE_DEV_TOOLS` | `true` |
| `LABOS_SURFACE_MAINTENANCE` | `true` |
| `LABOS_SURFACE_PREVIEW_INSTRUMENT` | `true` |
| `LABOS_SURFACE_KITCHEN_INSTRUMENTATION` | `true` |

## API contract

`GET /api/kitchen/features` returns:

```json
{
  "flags": { },
  "effectiveFlags": { },
  "experience": {
    "profile": "operator",
    "configuredProfile": "operator",
    "enabledExperiments": [],
    "surfaces": { }
  }
}
```

Clients should gate UI with `experience.surfaces` and run behavior with `effectiveFlags`.

## Web modules

| Module | Surface gate |
|--------|----------------|
| Operator kitchen | `operatorKitchen` (always true) |
| Setup fix-next | operator profile UX |
| Kitchen instrumentation drawer | `engineeringKitchenInstrumentation` |
| Camera plots / manual sensor | `engineeringPreviewInstrument` |
| DevPanel | `engineeringDevTools` |
| Reboot / maintenance | `engineeringMaintenance` |
| Preview Lab (`/operate/lab`) | `engineeringPerfLab` |
| Expert kitchen tabs | `engineeringKitchenExpert` / legacy `kitchenExpertTabs` |

## Preview Lab

- Route: `/operate/lab`
- API: `GET /api/preview/lab/reports` (lists `artifacts/preview-energy/**.summary.json`)
- Live: `GET /api/preview/metrics`, `GET /api/preview/health`

## Local development

```bash
# Operator demo (default)
pnpm --filter @openlabos/web dev

# Engineering + perf lab
LABOS_EXPERIENCE_PROFILE=engineering \
LABOS_ADAPTIVE_PREVIEW_ENABLED=true \
pnpm --filter @openlabos/api dev
```

## Migration notes

- `experience.mode === "experimental"` → use `experience.profile === "engineering"`
- `surfaces.advancedNavigation` → `surfaces.engineeringNavigation` (legacy key still populated)
- Auto mode no longer flips to engineering UI when flags are on unless `LABOS_ALLOW_ENGINEERING_AUTO=true`
