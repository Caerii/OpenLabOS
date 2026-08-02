# OpenLabOS Voice

`services/voice` joins a LiveKit room, subscribes to the operator's audio and
video, and returns spoken coaching. `apps/web` publishes the WebRTC tracks.
`services/api` remains responsible for protocols, adherence events, and
recordings.

When the agent joins a room, it fetches the active step and prior adherence
events from the API and adds that context to its instructions.

## Role in the system

- `apps/web` opens a LiveKit room and streams audio + video over WebRTC.
- `services/voice` runs as a LiveKit Agent in the same room.
- `services/api` provides the protocol context for the session (current step, expected entities, prior adherence events).
- The agent renders that context into the LLM prompt and produces real-time speech back to the operator.

## Bootstrap

```bash
uv sync --python 3.12
uv run python -m openlabos_voice.agent download-files
uv run python -m openlabos_voice.agent dev
```

## Environment

Copy `.env.example` to `.env.local` (do not commit `.env.local`).

LiveKit connection (required):

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Voice provider keys (pick one path):

- API-key mode: `GOOGLE_API_KEY`
- Vertex/ADC mode: `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, plus local ADC via `gcloud auth application-default login`

Optional tuning:

- `LABOS_AGENT_NAME` (default `openlabos-voice`)
- `LABOS_GEMINI_LIVE_MODEL`
- `LABOS_GEMINI_LIVE_VOICE` (default `Despina`)
- `LABOS_DASHBOARD_BASE_URL`: base URL of `services/api` for protocol context lookups

## Integration with `services/api`

When a room is joined, the agent uses `LABOS_DASHBOARD_BASE_URL` to fetch the protocol context for that session from `services/api`. That context is injected into the model's system instructions so the agent can:

- announce the next concrete step
- avoid claiming a step passed unless adherence says so
- frame deviations as recoverable corrections

The API owns adherence events. This service produces voice output and visual
context for the live session.

## Deploy

```bash
lk agent create
lk agent status
lk agent logs
lk agent update-secrets --secrets-file=.env.local
```

LiveKit Cloud injects `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
`LIVEKIT_API_SECRET` into deployed agent containers.
