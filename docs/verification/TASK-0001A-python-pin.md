# TASK-0001A: python-pin

## Scope

- Pin the monorepo’s Python toolchain to **CPython 3.12** for `apps/api`, `services/training`, and `services/eval`.
- Add `.python-version` files and regenerate `uv.lock` / `.venv` under that interpreter.
- Document the pin in ADRs and READMEs; fix verification markdown hygiene for TASK-0001.
- **Out of scope:** application code, new dependencies, Prompt 2 protocol schema work.

## Files changed

- `apps/api/pyproject.toml`, `services/training/pyproject.toml`, `services/eval/pyproject.toml` — `requires-python = ">=3.12,<3.13"`
- `.python-version`, `apps/api/.python-version`, `services/training/.python-version`, `services/eval/.python-version` — contents `3.12`
- `apps/api/uv.lock`, `services/training/uv.lock`, `services/eval/uv.lock` — regenerated with Python 3.12
- `docs/decisions/0006-local-first-default.md`, `docs/decisions/0008-storage-tiering.md` — verification notes for Python 3.12
- `README.md`, `apps/api/README.md`, `services/training/README.md`, `services/eval/README.md` — document the pin and `uv sync` usage
- `docs/journals/day-01.md` — append entry for this task
- `docs/verification/TASK-0001-repo-scaffold.md` — clarify “How to run” fences and close out the old Python drift open question

## Implementation summary

Python 3.12 is the single supported minor version for all uv-managed packages so FastAPI, future PyTorch/PEFT/TRL, and SQLite access paths stay aligned across laptops and CI. Each project declares `>=3.12,<3.13`, and `.python-version` files steer `uv` and IDE Python extensions. Lockfiles were refreshed after `uv sync --python 3.12`.

`docs/architecture/local-dev.md` does not exist yet (Prompt 4 adds the full web+API dev flow); until then, the root `README.md` and per-service READMEs are the source of truth for the interpreter pin.

## How to run

Ensure Python 3.12 is available to uv, then resync each Python root:

```bash
uv python install 3.12
```

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

Confirm each environment reports 3.12:

```bash
cd apps/api
uv run python --version
```

## Manual verification steps

1. Open any `pyproject.toml` under `apps/api` or `services/*` and confirm `requires-python = ">=3.12,<3.13"`.
2. Confirm `.python-version` exists at the repo root and in each Python project directory with content `3.12`.
3. Run `uv sync --python 3.12` in all three Python roots; expect success and updated `uv.lock` files.
4. Run `uv run python --version` in `apps/api` and confirm `Python 3.12.x`.

## Open questions

- Whether to add a CI job that asserts `uv sync` on 3.12 only (deferred until a CI skeleton exists).

## Notes

- If `uv sync` without `--python` still works, it should now default to 3.12 when the working directory contains `.python-version`.
