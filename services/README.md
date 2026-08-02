# Services

Live coordination runs in `api`. Step checks and optional object detection run
in `inference` and `perception`. Voice coaching is optional. Training and
evaluation are offline tools — they read saved runs and are not on the live
request path.

| Service | Stack | Role |
| --- | --- | --- |
| `api/` | Node 20, TypeScript, Express + Hono | Sessions, protocols, device routing, artifacts |
| `inference/` | Python 3.12, FastAPI | Step-check routing (Ollama, LM Studio, mock) |
| `perception/` | Python 3.12, FastAPI | Object detection / segmentation backends |
| `training/` | Python 3.12, PyTorch + TRL | Dataset prep and adaptation (offline) |
| `eval/` | Python 3.12 | Frozen splits and metrics (offline) |
| `voice/` | Python 3.12, LiveKit | Optional voice coaching over WebRTC |

Each service README owns its contract, configuration, and start command.
For how these planes fit a recorded run, see
[docs/architecture/why-openlabos.md](../docs/architecture/why-openlabos.md)
and [ARCHITECTURE.md](../ARCHITECTURE.md).
