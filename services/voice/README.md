# OpenLabOS Voice

Live-coaching voice agent for OpenLabOS. The service joins a LiveKit room and runs a real-time TTS/ASR session against the operator wearing the smart glasses (or any WebRTC client). It is consumed by `apps/web` via WebRTC: the browser publishes the egocentric camera + microphone tracks into a LiveKit room, and this agent subscribes, listens, watches, and speaks back.

The voice service is the realtime *media plane*. The structured *control plane* (protocols, adherence, recordings) lives in `services/api`. Per-session protocol context is fetched from `services/api` when a room is joined, and rendered into the agent's system instructions so the model can coach the operator through the active step.

## Role in the system

- `apps/web` opens a LiveKit room and streams audio + video over WebRTC.
- `services/voice` (this service) runs as a LiveKit Agent inside the same room.
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

LiveKit media plane (required):

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
- `LABOS_DASHBOARD_BASE_URL` — base URL of `services/api` for protocol context lookups

## Integration with `services/api`

When a room is joined, the agent uses `LABOS_DASHBOARD_BASE_URL` to fetch the protocol context for that session from `services/api`. That context is injected into the model's system instructions so the agent can:

- announce the next concrete step
- avoid claiming a step passed unless adherence says so
- frame deviations as recoverable corrections

Adherence events themselves are owned by `services/api`; this service only produces voice + visual context.

## Deploy

```bash
lk agent create
lk agent status
lk agent logs
lk agent update-secrets --secrets-file=.env.local
```

LiveKit Cloud automatically injects `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` into deployed agent containers.
