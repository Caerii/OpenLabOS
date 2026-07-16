# TASK-0004: web-shell

## Scope

- **`apps/web`**: Vite + React + TypeScript, tablet-first layout.
- **Routes:** landing (`/`), protocol selection + start session (`/start`), session runner (`/session/:sessionId`).
- **UI:** current step card, step list sidebar, judgment placeholder, **Mark complete** / **Flag issue** as **explicit placeholders** (no API mutations yet).
- **Client:** small typed module under `src/api/` using the **backend JSON shape directly** — no parallel domain model.
- **States:** loading, backend unavailable (banner + page-level errors), empty protocol list.
- **Out of scope:** camera/media, inference, Redux/Zustand/React Query, component frameworks, design systems.

## Files changed (key)

- [`apps/web/package.json`](../../apps/web/package.json) — scripts, React, router, Vite
- [`apps/web/vite.config.ts`](../../apps/web/vite.config.ts) — dev proxy `/api` → `127.0.0.1:8000`
- [`apps/web/index.html`](../../apps/web/index.html)
- [`apps/web/tsconfig.json`](../../apps/web/tsconfig.json)
- [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx), [`App.tsx`](../../apps/web/src/App.tsx), [`index.css`](../../apps/web/src/index.css)
- [`apps/web/src/api/types.ts`](../../apps/web/src/api/types.ts), [`client.ts`](../../apps/web/src/api/client.ts)
- [`apps/web/src/pages/`](../../apps/web/src/pages/) — `LandingPage`, `StartPage`, `SessionPage`
- [`apps/web/src/components/`](../../apps/web/src/components/) — chrome, backend banner, step list, current step, judgment placeholder
- [`apps/api/labos_api/main.py`](../../apps/api/labos_api/main.py) — `CORSMiddleware` for LAN / alternate dev origins
- [`apps/web/README.md`](../../apps/web/README.md)
- [`docs/architecture/local-dev.md`](../architecture/local-dev.md)
- [`docs/journals/day-04.md`](../journals/day-04.md)
- [`docs/decisions/0007-operator-surfaces.md`](../adr/decision 0007)
- [`docs/verification/TASK-0003-api-skeleton.md`](../verification/TASK-0003-api-skeleton.md) — HTTP routes table

## How to run

From repo root:

```bash
pnpm install
pnpm --filter @labos/web dev
```

In another terminal, from `apps/api`:

```bash
uv sync
uv run uvicorn labos_api.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:5173`, confirm the header shows **API: connected**, start a session from **Protocols**, verify five steps and **`active`** on the first.

## Manual verification

1. With API **down**, start the web dev server — header shows **API: unavailable** with a readable reason.
2. With API **up**, landing → protocols → start **kitchen-tea-v1** → runner shows **protocol_id**, **protocol_version**, **name**, and steps with **order** / **status** matching `GET /sessions/{id}`.
3. **`active`** step is visually dominant in the sidebar; **pending** / **completed** / **skipped** / **issue_flagged** pills differ (use devtools or a future PATCH to see non-pending states if needed).
4. Placeholder buttons show an **explicit note** that mutations are not implemented — no silent success.
5. **LAN (optional):** `VITE_API_BASE=http://<host>:8000` in `apps/web/.env.local`, Vite `--host 0.0.0.0`, API `--host 0.0.0.0`, open from tablet.

## Open questions

- When step mutations exist, whether to refetch session only or optimistically patch local state (still no global store required).
