# Services

Run live coordination in `api`, model judgments in `inference`, segmentation in
`perception`, and voice coaching in `voice`. Training and evaluation are
offline tools, not request-path services.

| Service           | Stack                | Talks to                                  |
| ----------------- | -------------------- | ----------------------------------------- |
| `api/`            | Node 20, TypeScript, Hono | Web app, devices, inference, perception |
| `inference/`      | Python 3.12, FastAPI | LLM providers, local runtimes             |
| `perception/`     | Python 3.12, FastAPI | Segmentation/tracker models               |
| `training/`       | Python 3.12, PyTorch + TRL | Datasets, checkpoints (offline)      |
| `eval/`           | Python 3.12          | Manifests, metric reports (offline)       |
| `voice/`          | Python 3.12, LiveKit | Web app via WebRTC                        |

Open a service README for its contract, configuration, and start command.
