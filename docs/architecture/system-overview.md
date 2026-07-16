# System overview (MVP)

LabOS demo is a **local-only** stack: a tablet web UI (later), this FastAPI service, SQLite for **session** state, filesystem-backed **protocol** JSON, and (later) LM Studio for judgments.

## Major components

| Piece | Role |
|-------|------|
| `packages/protocol-schema` | TypeScript + Zod: canonical **shape** and `examples/kitchen-tea-v1.json`. |
| `apps/api` | Serves HTTP API; loads protocol JSON at startup into an in-memory registry; persists **sessions** and **session_steps** in SQLite. |
| `apps/web` | Tablet-first Vite + React UI (TASK-0004); calls FastAPI. |
| `data/` | Media and labels (later prompts). |

## Protocol vs session (sharp boundary)

- **Protocols** are **not** stored in SQLite. They are **versioned JSON files** on disk (default: monorepo `packages/protocol-schema/examples/kitchen-tea-v1.json`). The API mirrors the JSON with **Pydantic** models and **validates at startup**; if the file is missing, malformed, or invalid, the process **fails fast**.
- **Sessions** are **runtime state**: who is running which protocol, and per-`step_id` status. That lives in **SQLite** (`sessions` + `session_steps` tables).

## API surface (this MVP)

- `GET /health` — `status`, `protocol_count`, `protocol_ids`, `sqlite_path`.
- `GET /protocols` — summaries (`protocol_id`, `protocol_version`, `name`).
- `GET /protocols/{protocol_id}` — full protocol document.
- `POST /sessions` — start a session; first step **active**, others **pending**; response includes protocol `name`/`version` and per-step `title` + protocol `order` (internal DB `step_order` is not exposed).
- `GET /sessions/{session_id}` — same denormalized session + step shape for the UI.
- `DELETE /sessions/{session_id}` — remove session; `session_steps` cascade.

No authentication in this slice; LAN/local use only (see decision 0006).

## Cross-language contract

The **shared artifact** between TypeScript and Python is the **JSON file**, not codegen. Python does not import TypeScript. Both sides validate independently (Zod vs Pydantic).
