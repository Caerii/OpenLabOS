# Testing in OpenLabOS

The test surface is growing and is not uniform across packages yet. This page
documents commands that exist today; planned coverage belongs in the roadmap.

## Main verification commands

Install and build workspace dependencies first:

```bash
pnpm install --frozen-lockfile
pnpm --filter @openlabos/protocol build
pnpm --filter @openlabos/preview build
pnpm --filter @openlabos/sdk-ts build
pnpm --filter @openlabos/device-android build
```

Then run the TypeScript/offline checks:

```bash
# All workspace test scripts (some packages currently declare placeholders)
pnpm test

pnpm typecheck

# API tests that must not call devices or providers
pnpm --filter @openlabos/api test:offline

# Real-device tests; explicit opt-in
pnpm --filter @openlabos/api test:device

# Provider/network tests; explicit opt-in
pnpm --filter @openlabos/api test:live
```

`pnpm check` combines typechecks, API offline tests, and the perception smoke
script. Run it only after installing the perception smoke dependencies shown
below.

## Docker Compose contract smoke

```bash
docker compose up --build --wait
pnpm compose:smoke
pnpm compose:protocol-run
pnpm compose:restart-persistence
docker compose down
```

The smoke script verifies:

- the compiled operator HTML is served;
- API health and dependency-aware readiness;
- API-to-perception health probing;
- API-to-inference forwarding through the deterministic mock provider; and
- direct health of both internal sidecars.

`compose:protocol-run` drives a full kitchen-tea session through the Hono API and
finalizes with a manifest. `compose:restart-persistence` verifies session events
survive `docker compose restart api`.

## Current coverage

| Area | Framework/runner | Current scope |
|---|---|---|
| `packages/protocol` | Vitest | Schema parsing and round trips |
| `packages/preview` | Vitest | Buffer, wire, health, energy, and latency models |
| `adapters/device-android` | Vitest | Client and replay fixtures |
| `services/api` | Custom TSX runner | Offline contracts plus gated device/live suites |
| `services/perception` | Python smoke script | Process and HTTP contract |
| `services/training` | pytest | GRPO and world-model utilities |
| `services/eval` | pytest | Hybrid validator |
| `services/voice` | pytest / LiveKit tests | Agent behavior |
| `apps/web` | Placeholder script | Dedicated browser/unit suite still pending |
| `packages/sdk-ts`, `packages/ui` | Placeholder scripts | Tests still pending |
| Compose stack | Node smoke script | Web and cross-service contracts |

## Python services

Python services use `uv` when they contain `pyproject.toml` and `uv.lock`:

```bash
cd services/eval
uv sync --python 3.12
uv run pytest -q
```

The perception sidecar currently uses pinned requirements:

```bash
python -m venv services/perception/.venv
services/perception/.venv/bin/python -m pip install \
  -r services/perception/requirements-smoke.txt
services/perception/.venv/bin/python scripts/check-sidecar-smoke.py
```

Use `Scripts/python` instead of `bin/python` on Windows.

## Test boundaries

- Offline tests must not require network access, credentials, or hardware.
- Device and live-provider tests must remain behind explicit commands.
- Fixtures must contain no secrets or private captured media.
- A regression should get the smallest test that reproduces it.
- Replay fixtures are preferred when behavior depends on a sequence of device
  or run events.

## Known gaps

- No committed Playwright/browser suite for the web app.
- No full protocol-run test through Compose.
- No provider contract tests in `services/inference/tests`.
- No enforced coverage thresholds.
- No persisted Hono-session restart test because that store is still in memory.
