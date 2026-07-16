# Services

Each service is a long-running process with a single responsibility and a
documented contract. Services are deployable independently and reachable only
through their public surface — never through shared in-process state.

| Service           | Stack                | Talks to                                  |
| ----------------- | -------------------- | ----------------------------------------- |
| `api/`            | Node 20, TypeScript, Hono | Web app, devices, inference, perception |
| `inference/`      | Python 3.12, FastAPI | LLM providers, local runtimes             |
| `perception/`     | Python 3.12, FastAPI | Segmentation/tracker models               |
| `training/`       | Python 3.12, PyTorch + TRL | Datasets, checkpoints (offline)      |
| `eval/`           | Python 3.12          | Manifests, metric reports (offline)       |
| `voice/`          | Python 3.12, LiveKit | Web app via WebRTC                        |

Per-service READMEs cover the wire contract, configuration, and runbook.
