# Server Architecture

The server is the boundary between the dashboard, glasses, AI providers, and local
runtime data. Route modules should expose HTTP behavior; domain modules should own
the actual work.

## Folders

- `ai` owns model/provider orchestration and domain AI logic.
- `labclaw` owns LabClaw-specific backend behavior.
- `lib` owns server utilities.
- `live-coach` owns Gemini Live voice sessions, recordings, and protocol voice assets.
- `preview` owns camera preview device integration, health, frame buffers, and recording control.
- `routes` owns Express route registration and request/response mapping.
- `scripts` owns operational scripts used from `package.json`.
- `tests` owns executable contracts and regression checks.

## Server Rule

Routes should be thin. If a route needs more than request parsing, auth/config
checks, and one service call, move the behavior into a domain module and test that
module directly.

