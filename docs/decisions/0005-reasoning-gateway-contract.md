# 0005 — Reasoning gateway contract

- Status: accepted
- Scope: `services/api`, `services/inference`, `services/perception`

## Context

A judgment is the model's verdict on one frame against one step. Producing
one involves prompts, sometimes intermediate perception calls, sometimes
multiple model providers, sometimes retries and cost guards. Cramming this
into the coordination API turns it into a vendor-SDK aggregator and ties
the system to whatever cloud account holds the keys.

## Decision

The reasoning plane lives behind one HTTP contract owned by
`services/inference`:

```
POST /judgments
  request:  { session_id, step, frame_uri, context, prefer? }
  response: Judgment           (per packages/protocol)
```

`services/api` calls this endpoint and stores the returned `Judgment`. It
does not import `@google/genai`, `@ai-sdk/openai`, `anthropic`, or any
provider SDK. Provider routing, prompt rendering, retries, multi-scale
evidence selection, and cost ceilings live inside `services/inference`,
behind a `Provider` interface. `services/perception` is a sibling that
returns observations the inference service can fold into its prompt.

When the inference service is down, the API returns 503 with a clear
contract; it does not silently degrade to a different judge.

## Consequences

- The API has no provider keys; it can run in environments without GPU
  credentials.
- Adding a provider is dropping a class into `services/inference/providers/`
  and registering it in the router.
- Operators can deploy more than one inference instance behind a load
  balancer without changing the API.
- The judgment surface stays small enough that humans can serve it
  manually for ground-truth labelling.

## Alternatives considered

- **Inference-as-library inside the API.** What we left behind. Vendor
  SDKs, retries, and rate-limit logic dragged the API toward one
  vendor's sharp edges.
- **gRPC gateway.** Possible later; HTTP/JSON is enough today and keeps
  human-in-the-loop debugging trivial.
