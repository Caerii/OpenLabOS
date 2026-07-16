# Contributing to OpenLabOS

Thanks for your interest. OpenLabOS aims to stay small at the core and
pluggable at the edges — most contributions land in adapters, modules, and
example protocols rather than the core schema or services.

## Ground rules

1. **Keep boundaries clean.** If a change crosses a plane (presentation →
   coordination → reasoning → learning), justify it in the PR description and
   consider whether it should be two changes.
2. **Write the test first when fixing a bug.** Goldens, fixtures, and replay
   harnesses live next to the code they cover.
3. **No vendor branding** in core packages. Keep proprietary names inside their
   own adapter or module package.
4. **Decision note for structural changes.** Anything that affects more than
   one service, the protocol schema, or a public contract gets a numbered note
   in `docs/decisions/` before merge.
5. **Local-first stays local-first.** A new feature must work offline by
   default. Cloud paths are opt-in.
6. **License by tree.** Code changes are Apache-2.0 (`LICENSE` at repo root).
   Documentation under `docs/` is CC0 (`docs/LICENSE`). Match the tree you
   edit.

## Workflow

```bash
pnpm install
pnpm typecheck
pnpm test
```

Python services use `uv`:

```bash
cd services/<name> && uv sync --python 3.12 && uv run pytest
```

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`,
`test:`). PRs that touch a public package bump its version per semver and add a
note to `CHANGELOG.md`.

## Reporting protocol

If you encounter a real lab safety issue while running OpenLabOS — e.g. a
hallucinated success judgment that could mask a hazardous mistake — open a
GitHub issue with the `safety` label and include the protocol id, the run
manifest, and the offending event log.
