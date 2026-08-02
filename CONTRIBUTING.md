# Contributing to OpenLabOS

Thanks for helping. Most changes belong in an adapter, service, example
protocol, or document. Change `packages/protocol` only when the wire format
itself must change.

Before writing code, skim
[docs/architecture/why-openlabos.md](docs/architecture/why-openlabos.md) so
new work reinforces a recorded run rather than a one-off demo path.

## Ground rules

1. **Keep service boundaries clear.** If a change touches the web app, API,
   and a Python service, explain why in the PR — or split the review.
2. **Write the test first when fixing a bug.** Goldens, fixtures, and replay
   harnesses live next to the code they cover.
3. **No vendor branding** in core packages. Keep proprietary names inside
   their adapter or module package.
4. **Decision note for structural changes.** Anything that affects more than
   one service, the protocol schema, or a public contract gets a numbered note
   in `docs/decisions/` before merge.
5. **Keep cloud services optional.** The basic workflow must still run without
   provider credentials.
6. **Do not overstate evidence** in UI or docs. Vision judgments are
   observations; measurements need instrument or display-readout provenance.
   Follow [docs/WRITING.md](docs/WRITING.md).
7. **License by tree.** Code changes are Apache-2.0 (`LICENSE` at repo root).
   Documentation under `docs/` is CC0 (`docs/LICENSE`). Match the tree you
   edit.

## Workflow

```bash
pnpm install
pnpm --filter @openlabos/protocol build
pnpm typecheck
pnpm test:offline
```

For the Compose path (Docker required):

```bash
docker compose up --build --wait
pnpm compose:smoke
pnpm compose:protocol-run
```

Python services use `uv`:

```bash
cd services/<name> && uv sync --python 3.12 && uv run pytest
```

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`,
`test:`). PRs that touch a public package bump its version per semver and add
a note to `CHANGELOG.md`.

## Useful documents

| Topic | Document |
| --- | --- |
| Writing and operator copy | [docs/WRITING.md](docs/WRITING.md) |
| Protocol authoring | [docs/protocols/authoring.md](docs/protocols/authoring.md) |
| Local development | [docs/architecture/local-dev.md](docs/architecture/local-dev.md) |
| Testing matrix | [docs/TESTING.md](docs/TESTING.md) |
| Roadmap | [docs/architecture/roadmap.md](docs/architecture/roadmap.md) |

## Reporting protocol

If you encounter a real lab safety issue while running OpenLabOS — for
example a hallucinated success judgment that could mask a hazardous mistake —
open a GitHub issue with the `safety` label and include the protocol id, the
run manifest or session id, and the offending event log.
