# Kitchen API Client

This folder is the browser-side contract for the Kitchen Demo and any future
protocol-guided physical workflow. It deliberately mirrors the server route
shape without exposing component state or UI concerns.

## Boundaries

- `transport.ts` owns `/api/kitchen/*` URL construction and HTTP verbs.
- `types.ts` owns shared response shapes used by dashboard components.
- `protocols.ts` owns protocol catalog and protocol persistence calls.
- `run.ts` owns active run lifecycle, step verification, and realtime supervisor calls.
- `analysis.ts` owns single-shot ER / perception primitives.
- `video.ts` owns video, teacher, and search-grounded analysis calls.
- `validation.ts` owns multiscale validation plan and execution calls.
- `demo.ts` owns preloaded demo dataset discovery.
- `session.ts` owns session manifest loading and export.

## Adding A New Kitchen Endpoint

Add the call in the file that matches its behavior, then export any new type
from `types.ts` if more than one component needs to know the shape. Keep React
state, UI labels, and polling behavior out of this folder; those belong in
`components/kitchen/controller` or feature components.

