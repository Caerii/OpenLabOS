# Demo runbook: operator loop

## 1. Run without hardware

From the repository root:

```bash
docker compose up --build --wait
pnpm compose:smoke
pnpm compose:protocol-run
pnpm compose:restart-persistence
```

Open <http://localhost:3847/operate>. These commands verify:

- the compiled operator interface and API health;
- deterministic perception and judgment contracts;
- a complete kitchen-tea API session; and
- session persistence across an API restart.

The Compose API runs with `CLOUD_MODE=true`, so ADB and physical-device routes
are intentionally disabled. Real model judgments additionally require the host
Ollama setup in [the Compose runbook](docker-compose.md).

## 2. Capture with a reference device

Use the source stack for hardware capture:

1. Follow [source development](../architecture/local-dev.md).
2. Set `CLOUD_MODE=false` in `services/api/.env`.
3. Connect the Android reference device over USB or WiFi ADB.
4. Run `pnpm doctor` and resolve device failures.
5. Open <http://localhost:5174/operate>.
6. Select the kitchen protocol, start a run, and perform each step.
7. Review the saved run and evidence in the Runs view.

Run data is written under `services/api/data` unless `OPENLABOS_DATA_DIR`
overrides it. Do not commit captured media without reviewing it for private or
sensitive content.

## 3. Evaluate a captured event log

Inspect the evaluation CLI before using a run because event schemas remain
pre-1.0:

```bash
cd services/eval
uv sync --python 3.12
uv run openlabos-eval-metrics --help
```

Then point it at the exported run event log and an output directory. Keep raw
captures outside `docs/`; commit only small, redacted reports or fixtures.

The automated Compose protocol-run check exercises the API and filesystem
manifest path. It does not drive the operator UI, capture real media, or measure
live model quality.
