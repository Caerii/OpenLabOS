# OpenLabOS

> An open, interoperable operating system for augmented laboratory work.

OpenLabOS turns sensor-equipped devices — smart glasses, webcams, tablets, mounted
cameras — into protocol-aware scientific instruments. It captures observations,
runs them through a pluggable perception and reasoning stack, judges whether a
protocol step succeeded, and produces clean datasets for training and evaluation.

The whole system is local-first, vendor-neutral, and fully open source.

## Why this exists

Lab workflows fail in mundane ways: a step skipped, a reagent confused, a
measurement misread. Existing tooling is either bespoke (one lab, one rig, one
script) or locked into a hardware vendor. OpenLabOS is the unopinionated
substrate that sits underneath: a protocol schema, a perception layer, a model
gateway, a session store, and the contracts between them — so anyone can plug in
their own glasses, their own VLM, their own domain modules, and their own
training loop.

## Repository layout

```
apps/
  web/                React + Vite + TypeScript UI
  device-reference/   Reference Android device-owner app (generic, not vendor-locked)

services/
  api/                Node/TypeScript API (Hono) — BFF, device proxy, session store
  inference/          Python FastAPI model gateway — routes between providers + local models
  perception/         Python perception sidecar — segmentation, tracking, spatial reasoning
  training/           Python training stack — SFT, DPO, GRPO, judgment LoRA, dataset ingestion
  eval/               Python evaluation harness — metrics, hybrid validators, regression suites
  voice/              LiveKit voice-agent for live coaching (optional)

packages/
  protocol/           Canonical protocol schema (Zod + JSON Schema → Python via codegen)
  sdk-ts/             Typed TypeScript client, generated from API OpenAPI spec
  sdk-py/             Python client mirroring sdk-ts
  ui/                 Shared React primitives (Tailwind, headless components)
  modules/            Domain modules: biotech, chemistry, materials, field-bio, nanotech, …

adapters/
  device-android/     ADB / on-device HTTP API adapter
  device-webcam/      Plain webcam / WebRTC adapter for laptop & tablet rigs
  device-ros2/        ROS 2 topic bridge for robotic stations
  device-serial/      USB serial / firmata adapter for microcontroller rigs

examples/
  protocols/          Reference protocol JSON (kitchen-tea, gel-electrophoresis, …)
  notebooks/          Jupyter notebooks that exercise services end-to-end

docs/
  adr/                Architectural decision records
  architecture/       System diagrams and rationale
  runbooks/           How to deploy, train, evaluate, debug
  protocols/          Protocol authoring guide
```

## Quickstart

Prereqs: Node ≥ 20, pnpm ≥ 9, Python 3.12, [uv](https://docs.astral.sh/uv/), Docker (optional).

```bash
pnpm install
pnpm --filter @openlabos/web dev          # Web UI on :5173

# In another shell:
cd services/api && pnpm dev                # API on :8787

# In another shell (Python services use uv):
cd services/inference && uv sync && uv run openlabos-inference   # :8000
```

The web app, API, and inference service are independent processes; bring up only
what you need. The full stack runs in `docker compose up` from the repo root.

## Design principles

1. **Local-first.** Every default path runs offline. Cloud providers (OpenAI,
   Anthropic, Gemini) are opt-in, never required.
2. **Vendor-neutral.** Devices, models, and runtimes are adapters behind stable
   interfaces. No hardware string is hardcoded outside its adapter.
3. **One schema, two languages.** `packages/protocol` is the source of truth.
   Python types are generated from its JSON Schema export — never duplicated.
4. **Boring stack at the boundaries, sharp tools where it counts.** FastAPI,
   React, Postgres-or-SQLite, pnpm, uv. PEFT/TRL/vLLM where ML actually happens.
5. **No god services.** Each service owns a small, documented surface. The API
   does not call vendor SDKs; the inference service does. The inference service
   does not own session state; the API does.
6. **Observable by default.** OpenTelemetry traces flow through every service.
   Every protocol run is reproducible from its event log.
7. **Document the *why*.** ADRs for structural choices, runbooks for operations,
   verification notes for non-trivial tasks.

## License

- **Code** (apps, services, packages, adapters, desktop, scripts, examples):
  [Apache-2.0](LICENSE).
- **Documentation** (`docs/`): [CC0 1.0](docs/LICENSE).

See [ADR 0018](docs/decisions/0018-dual-license.md) for rationale.

## Status

OpenLabOS is in active scaffolding. The protocol schema, web shell, API, and
inference gateway are the first milestones. See `docs/architecture/roadmap.md`.
