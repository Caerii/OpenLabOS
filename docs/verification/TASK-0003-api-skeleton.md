# TASK-0003: api-skeleton

## Scope

- FastAPI app with health, protocol list/detail, session create/get/delete.
- **Pydantic** models mirroring the shared **kitchen protocol JSON** (no codegen, no TS bridge).
- **File-backed protocols**: load and validate JSON at startup; **fail fast** with clear errors.
- **SQLite** (`sqlite3` stdlib only) for **sessions** + normalized **session_steps**; **no** protocol tables.
- **Initial step policy**: after sort by `order` then list index, **first step `active`**, all others **`pending`**.
- Architecture docs and decision 0008 clarification.
- **Out of scope:** media, inference, auth, ORM. (`local-dev.md` ships with Prompt 4 / TASK-0004.)

## Review follow-up (PM)

- **Public session steps** expose protocol `order` + `title` + `step_id` + `status` — **not** internal SQLite `step_order`.
- **Session responses** include `protocol_version` and protocol `name` so the web app can render without an extra protocol fetch.
- **`ProtocolRegistry`**: immutable instance held on **`app.state.registry`**; `Depends(get_registry)` reads it — no module-level mutable singleton.
- **Startup errors**: missing file → `FileNotFoundError` with path; bad JSON → `ValueError` with path + line/column; validation → `ValueError` with path + **field paths**.
- **SQLite**: `PRAGMA foreign_keys = ON` on init and on every request connection; `ON DELETE CASCADE` on `session_steps`; **`DELETE /sessions/{id}`** for cleanup.
- **Migrations**: **none** for MVP — **delete/recreate** the SQLite file for schema changes or demo reset.
- **`/health`**: includes `protocol_ids` and `sqlite_path`.
- **`smoke_api.py`**: asserts health, protocol detail, session create shape (5 steps, first active, indices 1–4 pending, protocol `order` on steps), unknown protocol → `422`, missing session `404`, delete.

## Documented HTTP routes (no hidden endpoints)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + `protocol_count`, `protocol_ids`, `sqlite_path`. |
| `GET` | `/protocols` | List protocol summaries. |
| `GET` | `/protocols/{protocol_id}` | Full protocol document JSON. |
| `POST` | `/sessions` | Create session (`{ "protocol_id": "…" }`); unknown id → `422`. |
| `GET` | `/sessions/{session_id}` | Denormalized session + steps. |
| `DELETE` | `/sessions/{session_id}` | Remove session; steps cascade (demo cleanup; used by `smoke_api.py`). |

OpenAPI: `/docs` when the server runs.

## Files changed (key)

- [`apps/api/pyproject.toml`](../../apps/api/pyproject.toml) — dependencies, `labos-api` script, optional `dev` extra (`httpx`) for smoke tests
- [`apps/api/labos_api/config.py`](../../apps/api/labos_api/config.py)
- [`apps/api/labos_api/main.py`](../../apps/api/labos_api/main.py)
- [`apps/api/labos_api/models/protocol.py`](../../apps/api/labos_api/models/protocol.py)
- [`apps/api/labos_api/models/session.py`](../../apps/api/labos_api/models/session.py)
- [`apps/api/labos_api/services/protocol_loader.py`](../../apps/api/labos_api/services/protocol_loader.py)
- [`apps/api/labos_api/services/protocol_registry.py`](../../apps/api/labos_api/services/protocol_registry.py)
- [`apps/api/labos_api/persistence/sqlite.py`](../../apps/api/labos_api/persistence/sqlite.py)
- [`apps/api/labos_api/persistence/session_repository.py`](../../apps/api/labos_api/persistence/session_repository.py)
- [`apps/api/labos_api/api/deps.py`](../../apps/api/labos_api/api/deps.py)
- [`apps/api/labos_api/api/routes/*.py`](../../apps/api/labos_api/api/routes/)
- [`apps/api/scripts/smoke_api.py`](../../apps/api/scripts/smoke_api.py)
- [`apps/api/var/.gitkeep`](../../apps/api/var/.gitkeep), [`apps/api/.gitignore`](../../apps/api/.gitignore)
- [`docs/architecture/system-overview.md`](../architecture/system-overview.md), [`data-flow.md`](../architecture/data-flow.md)
- [`docs/journals/day-03.md`](../journals/day-03.md)
- [`docs/decisions/0008-storage-tiering.md`](../adr/decision 0008)

## Implementation summary

The API validates the canonical protocol file into `ProtocolDocument`, stores it in an immutable `ProtocolRegistry` on `app.state`, and uses SQLite only for session metadata and per-step rows. Internal `step_order` supports `ORDER BY`; API consumers see the protocol’s `order` and `title` per step. `load_protocol_from_path` is factored for reuse and future unit tests.

## How to run

From `apps/api`:

```bash
uv sync
uv run labos-api
```

Or:

```bash
uv run uvicorn labos_api.main:app --reload --host 127.0.0.1 --port 8000
```

Optional smoke (requires dev extra):

```bash
uv sync --extra dev
uv run --extra dev python scripts/smoke_api.py
```

Environment:

- `LABOS_PROTOCOL_PATH` — override path to protocol JSON (default: monorepo `packages/protocol-schema/examples/kitchen-tea-v1.json`).
- `LABOS_SQLITE_PATH` — override SQLite file (default: `apps/api/var/labos_sessions.sqlite`).

## Manual verification steps

1. Start the server; `GET /health` returns `status`, `protocol_count >= 1`, `protocol_ids`, `sqlite_path`.
2. `GET /protocols` lists `kitchen-tea-v1`; `GET /protocols/kitchen-tea-v1` returns full document with five steps.
3. `POST /sessions` returns `201` with `protocol_version`, `name`, and five steps: first `active` with `order: 0` and a non-empty `title`; others `pending`; response must **not** contain `step_order` on steps.
4. `GET /sessions/{id}` matches the same denormalized fields.
5. `POST /sessions` with unknown `protocol_id` → `422` and detail mentions `Unknown protocol_id`.
6. `GET /sessions/{bad-uuid}` → `404`.
7. `DELETE /sessions/{id}` → `204`; subsequent `GET` → `404`.
8. Break the protocol file or point `LABOS_PROTOCOL_PATH` at garbage; startup should fail with a **readable** message (path + JSON line/col or field paths).
9. Inspect SQLite: `sqlite3 var/labos_sessions.sqlite ".schema"` shows `sessions` (including `protocol_version`) and `session_steps` with `ON DELETE CASCADE`.

## Open questions

- When the schema grows, whether to introduce migrations vs keep “delete sqlite file” for demos.

## Notes

- `httpx` is optional dev-only for `scripts/smoke_api.py`; production path is uvicorn only.
