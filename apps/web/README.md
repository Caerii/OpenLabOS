# apps/web

OpenLabOS web app — React 18 + Vite + TypeScript + Tailwind. Talks to
`services/api` over HTTP and to `services/voice` (when present) over WebRTC.

## Layout

```
src/
  main.tsx                  React entry
  App.tsx                   route shell + connection bar
  api.ts, api/              typed client over services/api
  components/               panels: vision, kitchen, hardware, files, OTA, …
  hooks/                    shared hooks (polling, etc.)
  lib/                      utilities
  navPaths.ts               route paths shared with React Router
  theme/                    Tailwind theme primitives
  data/                     static fixtures and demo configs
  tests/                    Vitest suites — see docs/test-catalog.md
```

## Run

```bash
pnpm --filter @openlabos/web dev
```

The dev server proxies `/api` to `OPENLABOS_API_URL` (default
`http://localhost:3847`). To point at a remote API:

```bash
OPENLABOS_API_URL=https://api.example.org pnpm --filter @openlabos/web dev
```

## Build

```bash
pnpm --filter @openlabos/web build
```

Output is `apps/web/dist/`. Any static host will do.
