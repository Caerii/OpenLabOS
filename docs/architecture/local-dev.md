# Local development: web + API

This note describes how to run the **FastAPI** service and the **Vite** tablet UI together on one machine or a small LAN.

## Ports and roles

| Process | Default | Purpose |
|---------|---------|---------|
| API (`uvicorn`) | `http://127.0.0.1:8000` | JSON: `/health`, `/protocols`, `/sessions`, OpenAPI `/docs` |
| Web (`vite`) | `http://127.0.0.1:5173` | Operator UI (`apps/web`) |

## Same machine (recommended first)

1. **API** — from `apps/api` after `uv sync`:

   ```bash
   uv run uvicorn labos_api.main:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Web** — from repository root after `pnpm install`:

   ```bash
   pnpm --filter @labos/web dev
   ```

In **development**, the UI calls **`/api/...`** on the Vite origin. Vite **proxies** `/api` to `http://127.0.0.1:8000` and strips the `/api` prefix, so the browser sees same-origin requests and you avoid CORS friction on localhost.

The API also enables **permissive CORS** (`allow_origins=["*"]`) so alternate dev setups (e.g. opening the Vite URL from a tablet by IP) still work if you point the UI at the API with `VITE_API_BASE`.

## Tablet on the LAN

1. Start the API bound to all interfaces (example):

   ```bash
   uv run uvicorn labos_api.main:app --host 0.0.0.0 --port 8000
   ```

2. Start Vite with host listen:

   ```bash
   pnpm --filter @labos/web dev -- --host 0.0.0.0
   ```

3. On the tablet, open `http://<pc-ip>:5173`. Set **`VITE_API_BASE`** to `http://<pc-ip>:8000` (e.g. in `apps/web/.env.local`, which is gitignored) so fetches go directly to the API instead of through the dev machine’s loopback-only proxy target.

   Important: the Vite **`/api` proxy** only targets **the machine running Vite** (`127.0.0.1:8000`). That works for a browser on the same machine, but a tablet hitting `http://<pc-ip>:5173` should use **`VITE_API_BASE=http://<pc-ip>:8000`** so the tablet can reach the API over the LAN.

Rebuild or restart Vite after changing env vars.

## Environment variables (recap)

| Variable | Where | Meaning |
|----------|-------|---------|
| `LABOS_PROTOCOL_PATH` | API | Path to protocol JSON (default: monorepo example file). |
| `LABOS_SQLITE_PATH` | API | SQLite file for sessions. |
| `VITE_API_BASE` | Web | Absolute base URL of the API (no trailing slash). Optional in dev when using the `/api` proxy. |

## Failure modes

- **Blank or stuck UI** — Check the **API** banner in the header; if it reads “unavailable”, the browser cannot reach the configured API base URL.
- **422 on start session** — Unknown `protocol_id`; fix selection or load the right protocol file on the API.
- **Stale schema** — MVP has no migrations; delete the SQLite file under `apps/api/var/` when the API schema changes (see `apps/api/README.md`).

## See also

- [`apps/api/README.md`](../../apps/api/README.md) — HTTP routes (including `DELETE /sessions/{id}` for demo cleanup).
- [`apps/web/README.md`](../../apps/web/README.md) — routes and state model for the UI shell.
