# First successful run

Start the Compose stack, complete the kitchen-tea protocol through the API,
inspect the record it leaves behind, and verify that the session survives an
API restart. The browser steps show the operator flow; the scripts provide
repeatable verification; the API tour at the end shows you the actual data.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Node.js 20+ with pnpm (for the verification scripts and API tour)

Nothing else. No GPU, no model download, no device — the scripted path uses
the deterministic mock provider throughout.

## Steps

1. Start the stack from the repository root:

   ```bash
   docker compose up --build --wait
   ```

   The first build takes several minutes; `--wait` returns once all three
   containers report healthy. If it hangs, see the
   [Compose troubleshooting section](docker-compose.md#troubleshooting).

2. Open the operator console at <http://localhost:3847/operate/kitchen>.

3. Select **Tea preparation** and start a guided run. Compose uses mock
   perception. Interactive step checks go to Ollama on the host when it is
   running; without Ollama the guided run still works but live judgments
   return errors — the scripted path below does not have this dependency.

4. Verify the stack and complete a full protocol through the API:

   ```bash
   pnpm compose:smoke
   pnpm compose:protocol-run
   ```

   Expected output shape (IDs will differ):

   ```text
   [compose:smoke] All services are healthy.
     operator:   http://127.0.0.1:3847/operate
     api:        @openlabos/api
     inference:  ollama (mock:deterministic bridge verified)
     perception: mock

   [compose:protocol-run] Protocol run completed.
     session_id: 3f2b8c1e-...
     status:     completed
     steps:      5
   ```

5. Confirm sessions survive an API restart:

   ```bash
   pnpm compose:restart-persistence
   ```

   This creates a session, appends an operator note, restarts the API
   container, and verifies the note is still readable. It proves the session
   store writes to the Docker volume, not container memory.

## Inspect what the run recorded

Take the `session_id` printed by `compose:protocol-run` and walk the record
through the API:

```bash
# Folded view: status, active step, event counts
curl -s http://localhost:3847/api/sessions/<session_id>

# Every event in order: step_started, judgment_emitted, step_completed, ...
curl -s http://localhost:3847/api/runs/<session_id>/timeline

# Duration, steps completed, judgments emitted
curl -s http://localhost:3847/api/runs/<session_id>/metrics

# All runs, filterable
curl -s "http://localhost:3847/api/runs?status=completed"
```

The timeline for the kitchen-tea run shows three events per step — a
`step_started`, a `judgment_emitted`, and a `step_completed` — followed by
one `session_finalized`. That event log is the primary record: replaying it
in order reconstructs the session state.

The raw files live inside the data volume, one directory per session:

```bash
docker compose exec api ls /workspace/services/api/data/sessions/<session_id>
```

```text
session.json    # protocol id + version, adapter, status, timestamps
events.jsonl    # the append-only log, one JSON object per line
manifest.json   # RunManifest written at finalize
```

## What success looks like

- `/api/healthz` returns `ok: true` and `/api/readyz` reports both
  dependency checks healthy
- `compose:protocol-run` finalizes a five-step session with
  `status: completed`
- `compose:restart-persistence` finds its session events after
  `docker compose restart api`
- The timeline endpoint returns 16 events for the protocol run (three per
  step plus the finalize)

If an interactive judgment in the browser fails while the scripts pass, the
model server is the difference: the scripts request the deterministic mock
provider, while the browser path uses the configured default (Ollama).
Check `curl http://localhost:11434/api/tags` on the host.

## Stop

```bash
docker compose down
```

Sessions survive. `docker compose down --volumes` deletes them.

## Next

- Write your own protocol and run it: [Protocol authoring](../protocols/authoring.md)
- Compose operations, configuration, and GPU overlay: [docker-compose.md](docker-compose.md)
- Hardware capture loop: [demo-labos-loop.md](demo-labos-loop.md)
- From a finished run to eval metrics: [run-to-eval.md](run-to-eval.md)
