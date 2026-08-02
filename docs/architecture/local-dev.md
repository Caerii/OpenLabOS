# Local development

Prefer [Docker Compose](../runbooks/docker-compose.md) when you only need a
working stack. Use the commands below when you want hot reload, a real device
adapter, or to edit services in place.

## Ports and roles

| Process | Default | Purpose |
|---|---:|---|
| Node API | `3847` | Express runtime plus mounted Hono routes |
| Vite web app | `5174` | Operator and engineering interfaces |
| Python step-check | `8001` | Ollama / LM Studio / mock judgments |
| Python object detection | `8002` | Mock or configured segmentation |

## Install workspace dependencies

```bash
pnpm install
pnpm --filter @openlabos/protocol build
pnpm --filter @openlabos/preview build
pnpm --filter @openlabos/sdk-ts build
pnpm --filter @openlabos/device-android build
```

## Start API and web

Create the local API environment once:

```bash
cp services/api/.env.example services/api/.env
```

Terminal 1:

```bash
pnpm --filter @openlabos/api dev
```

Terminal 2:

```bash
pnpm --filter @openlabos/web dev
```

Open <http://localhost:5174/operate>. Vite proxies `/api` and the live-coach
WebSocket to `http://localhost:3847`.

The source environment uses mock entity segmentation and forwards judgments to
`http://localhost:8001`. You can do most operator UI work without starting
either Python sidecar.

## Optional inference

```bash
cd services/inference
uv sync --python 3.12
uv run openlabos-inference
```

The default provider is Ollama. Set `OPENLABOS_PROVIDER=lmstudio` to use the
LM Studio adapter, or `OPENLABOS_PROVIDER=mock` for a deterministic contract
response.

## Optional perception

For contract testing without GPU dependencies:

```bash
cd services/perception
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-smoke.txt
.venv/Scripts/python -m uvicorn app:app --host 127.0.0.1 --port 8002
```

On macOS/Linux, replace `.venv/Scripts/python` with `.venv/bin/python`.
Then set these values in `services/api/.env`:

```dotenv
LABOS_ENTITY_SEGMENTATION_MODE=sidecar
LABOS_SEGMENTATION_SIDECAR_URL=http://localhost:8002
```

## LAN access

The API has no user authentication. Do not expose the source servers to an
untrusted network.

For a controlled LAN test:

1. keep `OPENLABOS_API_HOST=0.0.0.0`;
2. set `CORS_ORIGIN=http://<dev-machine-ip>:5174`;
3. run Vite with `pnpm --filter @openlabos/web dev -- --host 0.0.0.0`; and
4. open `http://<dev-machine-ip>:5174/operate`.

The browser still talks to Vite, which proxies API requests on the development
machine.

## Verification

```bash
pnpm --filter @openlabos/api typecheck
pnpm --filter @openlabos/web typecheck
pnpm --filter @openlabos/api test:offline
```

See [Testing](../TESTING.md) for the test matrix and
[Security](../../SECURITY.md) before changing network exposure.

## Troubleshooting

### Imports from `@openlabos/protocol` fail to resolve

The workspace packages ship compiled output; a fresh clone has no `dist/`
directories. Run the package builds from the install section (at minimum
`pnpm --filter @openlabos/protocol build`) before starting the API or web
dev servers. The same error after pulling schema changes means the package
needs rebuilding.

### Port 3847 or 5174 already in use

Another API or Vite instance is holding the port — often a Compose stack:
`docker compose ps` and `docker compose down` if so. Otherwise find the
process (`netstat -ano | findstr :3847` on Windows, `lsof -i :3847`
elsewhere). Changing `OPENLABOS_API_PORT` also requires updating the Vite
proxy target and any `.env` URLs that reference it, so freeing the port is
usually simpler.

### The web app loads but every API call fails

Vite proxies `/api` to `http://localhost:3847`, so this means the API
process is not running or crashed at startup — check terminal 1. Requests
that fail with CORS errors instead point at a `CORS_ORIGIN` that does not
match the origin in the browser address bar.

### Judgments return 502 from the API

The API forwards `/api/judgments` to `OPENLABOS_INFERENCE_URL` (default
`http://localhost:8001`). A 502 with `inference unreachable` means nothing
is listening there: start the inference service from the optional-inference
section, or exercise the contract without a model server by sending
`"provider": "mock"` in the request body.

### The perception sidecar is up but `/api/readyz` reports it failing

`readyz` probes the sidecar only when `LABOS_ENTITY_SEGMENTATION_MODE=sidecar`
is set in `services/api/.env` along with `LABOS_SEGMENTATION_SIDECAR_URL`.
If both are set and it still fails, the detail string in the `readyz`
response is the actual fetch error — typically a wrong port or the venv
uvicorn process having exited.

### Python service commands fail on Windows

The venv layout differs: use `.venv\Scripts\python` where Unix docs say
`.venv/bin/python`. For `services/inference`, prefer `uv run`, which
resolves the environment on any platform.
