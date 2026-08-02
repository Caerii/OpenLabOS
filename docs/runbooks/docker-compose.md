# Docker Compose local stack

Run the operator console, API, step-check service, and mock object detection
from the root `compose.yaml`. No connected device is required.

## Stack anatomy

| Service | Internal port | Public exposure | Role |
|---|---:|---|---|
| `api` | 3847 | `127.0.0.1:${OPENLABOS_PORT:-3847}` | Sessions, protocols, device routing; also serves the compiled web app |
| `inference` | 8001 | Compose network only | Judgment requests, routed to host Ollama by default |
| `perception` | 8002 | Compose network only | Deterministic mock object detection |

Startup order is enforced: the API container starts only after `inference`
and `perception` pass their health checks, and `--wait` returns only after
the API itself is healthy. Each service probes its own loopback endpoint —
`/api/healthz`, `/v1/healthz`, and `/health` respectively — every 10 seconds.

Container hardening is on by default: all three images run as non-root with
read-only root filesystems, `no-new-privileges`, tmpfs `/tmp`, and memory
limits (1 GB api, 2 GB inference, 512 MB perception). The API writes only to
its two named volumes:

| Volume | Mounted at | Holds |
|---|---|---|
| `openlabos-api-data` | `/workspace/services/api/data` | Sessions, events, manifests, run index |
| `openlabos-api-artifacts` | `/workspace/services/api/artifacts` | Generated media and derived artifacts |

The inference container reaches the Docker host through
`host.docker.internal` (mapped via `extra_hosts` so it also works on Linux
Engine). That is how judgment requests reach an Ollama server running outside
Docker.

## Start

Prerequisites:

- Docker Engine or Docker Desktop with Compose v2
- At least 4 GB free disk for the initial image build

From the repository root:

```bash
docker compose up --build --wait
```

Open <http://localhost:3847/operate>. With Node 20+ and pnpm available, run
the three verification scripts:

```bash
pnpm compose:smoke
pnpm compose:protocol-run
pnpm compose:restart-persistence
```

What each one proves:

- **`compose:smoke`** — the API answers `/api/healthz` and `/api/readyz`, the
  compiled web app is served at `/operate`, the perception probe reports the
  sidecar healthy, and a mock judgment round-trips API → inference → API. On
  success it prints one line per service, ending with the configured provider
  and perception backend.
- **`compose:protocol-run`** — creates a session for `kitchen-tea`, appends
  `step_started` / `step_completed` events and a mock judgment for all five
  steps, finalizes with `status: completed`, and reads the run timeline back.
  It prints the `session_id` it created.
- **`compose:restart-persistence`** — creates a session, appends an
  `operator_note`, runs `docker compose restart api`, and verifies the note
  is still there. This exercises the filesystem session store on the data
  volume, not container memory.

All three exit non-zero with a `[script-name] reason` line on failure.

## Day-to-day operations

```bash
docker compose ps                      # container state and health
docker compose logs --follow api      # one service's logs
docker compose logs --since 10m       # everything recent
docker compose restart api            # restart one service; sessions survive
docker compose up --build api         # rebuild after changing API code
```

Inspect session data inside the volume:

```bash
docker compose exec api ls /workspace/services/api/data/sessions
docker compose exec api cat /workspace/services/api/data/sessions/<id>/events.jsonl
```

Back up the data volume to a tarball in the current directory:

```bash
pnpm compose:export-data
```

Reset to a clean demo state (destroys all sessions):

```bash
pnpm compose:reset-demo
```

## Configuration

Compose reads a root `.env` file. Copy the example and edit only what you
need; every variable has a working default:

```bash
cp .env.compose.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `OPENLABOS_PORT` | `3847` | Host port, bound on loopback only |
| `LABOS_EXPERIENCE_PROFILE` | `operator` | `operator` hides engineering panels; `engineering` shows them |
| `OPENLABOS_PROVIDER` | `ollama` | Default judgment provider (`ollama`, `lmstudio`, `mock`) |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | Where inference finds Ollama |
| `OLLAMA_MODEL` | `llama3.2-vision` | Vision model for judgments |
| `LABOS_SEGMENTATION_BACKEND` | `mock` | Perception backend |
| `LABOS_SEGMENTATION_TOKEN` | empty | Optional bearer token between API and perception |
| `CORS_ORIGIN` | `http://localhost:3847` | Allowed browser origin |

Changes to `.env` take effect on the next `docker compose up`.

## Model provider

The inference service is healthy without a model server — health checks only
prove the process runs. Interactive judgment requests need Ollama on the
host:

```bash
ollama pull llama3.2-vision
ollama serve
```

To use a different model, set `OLLAMA_MODEL` in `.env`. To point at an Ollama
instance elsewhere on the network, set `OLLAMA_BASE_URL`. The scripted checks
never need this: they request `provider: "mock"` explicitly, which is why CI
can run them without a GPU or model download.

## Perception modes

The base stack pins `LABOS_SEGMENTATION_BACKEND=mock` so it stays CPU-only
and deterministic. The mock returns schema-shaped observations without
looking at the image — enough to verify the contract, not enough to trust
masks.

Grounded SAM 2 runs under the experimental GPU overlay, which swaps the
perception image, adds an NVIDIA device reservation, and caches model
downloads in a dedicated volume:

```bash
docker compose -f compose.yaml -f compose.gpu.yaml up --build perception
```

Requirements: an NVIDIA GPU, the NVIDIA Container Toolkit, and several GB for
the model cache on first start (`GROUNDING_DINO_MODEL` and `SAM2_MODEL`
default to `grounding-dino-tiny` and `sam2-hiera-large`). The overlay extends
the health-check start period to 120 s because model loading is slow. This
path is not covered by CI.

## Stop and reset

```bash
docker compose down             # stop; volumes and sessions survive
docker compose down --volumes   # stop and DELETE all session data
```

## Troubleshooting

### Port 3847 is already in use

Bind a different host port; container networking is unchanged:

```bash
OPENLABOS_PORT=8080 docker compose up --build --wait
```

PowerShell:

```powershell
$env:OPENLABOS_PORT = "8080"
docker compose up --build --wait
```

### `up --wait` hangs or the API stays unhealthy

The API refuses to start until both dependencies are healthy, so look at
those first:

```bash
docker compose ps
docker compose logs inference perception
docker compose logs api
```

A common cause after editing `.env` is an invalid value reaching a service;
the failing container's log names the variable.

### `/api/readyz` returns 503 while `/api/healthz` is fine

`healthz` is process liveness; `readyz` probes the inference service and,
when segmentation mode is `sidecar`, the perception service. The response
body names the failing check:

```bash
curl -s http://localhost:3847/api/readyz
```

### Judgment requests return 502

The stack is running but the model server is not reachable, or the model is
not pulled. Verify from the host:

```bash
curl -s http://localhost:11434/api/tags   # Ollama running? model listed?
```

Then check `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`. Note that
`compose:smoke` passing does not prove Ollama works — the smoke test uses the
deterministic mock provider.

### The web app shows a stale build

The web bundle is compiled into the API image. Rebuild it:

```bash
docker compose up --build api
```

### Sessions disappeared

Sessions live in the `openlabos-api-data` volume. They survive `down`,
`restart`, and rebuilds. They are deleted only by `docker compose down
--volumes` or `pnpm compose:reset-demo`. Check the volume exists:

```bash
docker volume ls --filter name=openlabos
```

## Related

- [First successful run](first-successful-run.md) — guided walkthrough
- [Reverse proxy](reverse-proxy.md) — before exposing beyond loopback
- [services/api reference](../../services/api/README.md) — the endpoints
  behind these checks
