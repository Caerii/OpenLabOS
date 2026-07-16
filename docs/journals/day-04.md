# Day 04 journal

---

## Entry: Tablet-first web shell (TASK-0004)

- Scaffolded **`apps/web`** with Vite + React + TypeScript: boring routes (`/`, `/start`, `/session/:id`), no global data libraries.
- **`src/api/types.ts`** mirrors the FastAPI session and health JSON shapes; **`src/api/client.ts`** is a thin `fetch` wrapper with explicit **`ApiError`** (network vs HTTP vs parse).
- **Pages:** landing copy, protocol picker + `POST /sessions`, session runner with sidebar step list, current-step card, judgment placeholder, and clearly labeled **placeholder** actions (no silent fake mutations).
- **UX:** header **API connectivity** banner (polls `/health`), loading and empty-protocol states, tablet-first CSS (landscape-friendly grid, large tap targets, distinct step status visuals).
- **Dev ergonomics:** Vite **`/api` → 127.0.0.1:8000` proxy**; optional **`VITE_API_BASE`** for LAN tablets. API gained permissive **CORS** for cross-origin dev.
- **Docs:** `apps/web/README.md`, `docs/architecture/local-dev.md`, `docs/verification/TASK-0004-web-shell.md`, decision 0007 verification notes; TASK-0003 gained an explicit **HTTP routes** table (including `DELETE`).

---
