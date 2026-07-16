# TASK-0001: repo-scaffold

## Scope

- Establish monorepo layout with pnpm workspaces and uv-managed Python packages.
- Add documentation skeleton: templates, ADR stubs, journal day-01, this verification doc.
- Add subsystem README placeholders and `data/` layout documentation.
- **Out of scope:** protocol schema logic, FastAPI routes, React UI, media pipeline, inference, training, eval metrics.

## Files changed

Key paths (non-exhaustive):

- Root: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `README.md`
- Workspace packages: `apps/web`, `apps/api`, `packages/protocol-schema`, `packages/client-sdk`, `services/training`, `services/eval`
- Python: `apps/api/pyproject.toml`, `apps/api/labos_api/`, `services/training/pyproject.toml`, `services/training/labos_training/`, `services/eval/pyproject.toml`, `services/eval/labos_eval/`
- Docs: `docs/decisions/*`, `docs/verification/*`, `docs/journals/day-01.md`, placeholder dirs under `docs/architecture`, `docs/protocols`, `docs/eval`, `docs/runbooks`, `docs/demos`
- Data layout: [`data/README.md`](../../data/README.md), `data/raw/.gitkeep`, `data/processed/.gitkeep`, `data/labels/.gitkeep`, `data/splits/.gitkeep`
- Client SDK placeholder: `packages/client-sdk/README.md`
- Extra ADR stubs: `docs/decisions/0012-vision-language-baseline.md`, `docs/decisions/0013-adaptation-training-stack.md`
- Lockfiles: `uv.lock` under each Python root after `uv sync`

## Implementation summary

The repository is wired as a pnpm monorepo with TypeScript placeholders in `packages/*` and Python packages installable via uv in `apps/api` and `services/*`. Documentation templates and ADR stubs encode the review contract for later tasks. No runtime services are started by this task.

## How to run

From the repository root (path on your machine may differ):

### Node (pnpm)

```bash
pnpm install
```

### Python (uv)

Python is pinned to **3.12** after TASK-0001A. Prefer explicit sync per project:

```bash
cd apps/api
uv sync --python 3.12
```

```bash
cd services/training
uv sync --python 3.12
```

```bash
cd services/eval
uv sync --python 3.12
```

### TypeScript packages

```bash
pnpm --filter @labos/protocol-schema run build
```

```bash
pnpm --filter @labos/client-sdk run build
```

## Manual verification steps

1. Confirm `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `services/*`.
2. Run `pnpm install` from the repo root; expect success and `node_modules` at root.
3. Run `uv sync --python 3.12` in `apps/api`, `services/training`, and `services/eval`; expect each to create `.venv` and `uv.lock` (see TASK-0001A).
4. Open `docs/decisions/0008-storage-tiering.md` and confirm filename matches later prompt references.
5. Skim `docs/journals/day-01.md` for the TASK-0001 entry.

## Open questions

- Open the Cursor workspace at `F:\Github\OpenLabOS\LabOS` if the agent `move_agent_to_root` MCP call is unavailable in your session (`composerId` error).

Resolved: Python is pinned to **3.12** — see `docs/verification/TASK-0001A-python-pin.md`.

## Notes

- `move_agent_to_root` via MCP failed in this environment with `composerId is required`; files were written directly to `F:\Github\OpenLabOS\LabOS`. Open that folder as the workspace root in Cursor for follow-on prompts.
- Python packages set `readme = "README.md"` now that subsystem READMEs exist; `uv sync` must succeed in each Python root before merging.
