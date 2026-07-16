# Day 03 journal

---

## Entry: FastAPI + SQLite API skeleton (TASK-0003)

- Added FastAPI + Uvicorn + Pydantic to `apps/api`; `labos-api` console script for Uvicorn.
- Implemented **Pydantic mirrors** of the kitchen protocol JSON in `labos_api/models/protocol.py`; **session/API DTOs** in `models/session.py`.
- **ProtocolRegistry** loads a single JSON path at startup (`load_protocol_from_path`); **no** protocol rows in SQLite.
- **sqlite3** only: `sessions` and normalized `session_steps` tables; repository inserts initial steps with **first `active`**, rest **`pending`**.
- Routes: `/health` (with `protocol_count`), `/protocols`, `/protocols/{id}`, `/sessions` POST/GET.
- Architecture docs: `system-overview.md`, `data-flow.md`; verification `TASK-0003-api-skeleton.md`; decision 0008 updated for file-vs-DB split.
- Next: Prompt 4 — Vite/React tablet shell calling this API.

---

## Entry: TASK-0003 review hardening

- Session JSON exposes protocol `order` + `title` (not internal `step_order`); responses include `protocol_version` and protocol `name`.
- `/health` returns `protocol_ids` and `sqlite_path`; startup validation errors include JSON line/column or Pydantic field paths.
- `DELETE /sessions/{id}`; documented no-migrations demo DB reset; decision 0008 verification notes for FK pragma + cascade.
- `smoke_api.py` asserts protocol detail, session shape, unknown-protocol `422`, missing session `404`, and delete.
