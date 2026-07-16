# Local Agent Operator

OpenLabOS can run as a local API plus web operator, with an optional HTTPS tunnel for browser sessions that need to reach the local machine.

## Commands

```powershell
pnpm local-agent
pnpm local-agent:tunnel:install
pnpm local-agent:tunnel
pnpm local-agent:up
pnpm local-agent:register-protocol
```

`pnpm local-agent:up` starts the API on `http://localhost:3847`, the operator on `http://localhost:5174/operate`, and an HTTPS tunnel when `cloudflared` is available.

`pnpm local-agent:register-protocol` registers `openlabos://start-agent` for the current Windows user. The protocol launcher logs to `.tmp/openlabos-protocol-launcher.log`.

## Environment

| Variable | Purpose |
| --- | --- |
| `OPENLABOS_OPERATOR_URL` | Operator URL used when printing a tunnel-backed launch link. Defaults to `http://localhost:5174/operate`. |
| `OPENLABOS_TUNNEL_PROVIDER` | Set to `ngrok` to use `ngrok http` instead of Cloudflare Tunnel. |
| `OPENLABOS_API_PORT` | Local API port. Defaults to `3847`. |
| `OPENLABOS_CLIENT_PORT` | Local web client port. Defaults to `5174`. |
| `OPENLABOS_DATA_DIR` | API data directory override. Useful for tests or locked Windows checkouts. |
| `OPENLABOS_PUBLIC_DIR` | Public fixture/static directory override. Used by verification that writes generated demo assets. |

## Power And Perception

```powershell
pnpm power:profile -- --label baseline --duration 60 --interval 5
pnpm power:matrix -- --device 192.168.50.122:5555 --duration 120 --interval 5 --fps-list 0,1,3,6,10,15
pnpm sidecar:smoke
```

`power:matrix` writes JSONL samples, CSV summaries, SVG plots, and a `matrix.summary.json` under `services/api/data/power-profiles` unless the working directory or data path is overridden.
