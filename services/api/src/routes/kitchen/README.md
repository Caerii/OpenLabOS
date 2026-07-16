# Kitchen Routes

This folder maps HTTP requests onto Kitchen workflow services. Route files should
stay thin: parse request data, call the relevant domain/runtime function, record
events, and return JSON.

## Utility Boundaries

- `shared.ts` is a compatibility barrel only.
- `access.ts` owns state/protocol lookup and request parsing helpers.
- `events.ts` owns event and snapshot queueing.
- `frame-input.ts` owns frame capture/materialization helpers.
- `live-coach-context.ts` owns text context sent to Gemini Live voice.
- `hands-free-routes.ts` owns the server-side glasses demo transaction: WiFi
  pairing, native recording, Gemini Live audio bridge, run start, and realtime
  supervisor start/stop.
- `mutations.ts` owns the standard mutation wrapper for run routes.
- `teacher-judgment.ts` owns teacher/student schema and agreement helpers.

If a helper starts depending on AI providers, device preview, or persistent
workflow state, keep it in the narrowest matching module instead of adding it to
`shared.ts`.
