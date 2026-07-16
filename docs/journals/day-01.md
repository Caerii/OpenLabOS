# Day 01 journal

Append-only log for work completed on day 1 of the LabOS demo track.

---

## Entry: repo and documentation scaffold (TASK-0001)

- Created pnpm workspace layout (`apps/*`, `packages/*`, `services/*`) with placeholder packages only—no application logic.
- Added uv-managed Python packages for `apps/api`, `services/training`, and `services/eval` with minimal installable modules.
- Established documentation skeleton: ADR and verification templates, ADR stubs 0001–0008 (0007–0008 proposed), `data/` layout with `.gitkeep` markers, `packages/client-sdk` README, journals and verification for this task.
- Next: Prompt 2 implements `packages/protocol-schema` (types, validation, kitchen-tea example JSON and prose).

---

## Entry: Python 3.12 pin (TASK-0001A)

- Set `requires-python = ">=3.12,<3.13"` for `apps/api`, `services/training`, and `services/eval`.
- Added `.python-version` (`3.12`) at repo root and in each Python project; regenerated `uv.lock` with `uv sync --python 3.12`.
- Documented the pin in decision 0006 and decision 0008 verification notes, root README, and Python service READMEs; added `docs/verification/TASK-0001A-python-pin.md` and cleaned `TASK-0001` “How to run” markdown.
- `docs/architecture/local-dev.md` still deferred to Prompt 4; local interpreter policy lives in READMEs until then.
