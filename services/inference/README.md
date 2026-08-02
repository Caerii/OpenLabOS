# Step-check service (`services/inference`)

Accepts a protocol-step judgment request from the API and routes it to Ollama,
LM Studio, or the deterministic mock provider. It does not store session
state or advance protocol steps.

## Start

```bash
cd services/inference
uv sync --python 3.12
uv run openlabos-inference
```

The service binds to `0.0.0.0:8001`. Verify it with:

```bash
curl http://localhost:8001/v1/healthz
```

For reload during development:

```bash
uv run uvicorn openlabos_inference.openlabos_main:app \
  --reload --host 127.0.0.1 --port 8001
```

## HTTP contract

`POST /v1/judgments` accepts:

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "step": {
    "step_id": "heat-water",
    "title": "Heat water",
    "instruction": "Heat water until steaming.",
    "expected_objects": [],
    "success_criteria": [
      { "kind": "visual", "description": "Steam is visible." }
    ]
  },
  "frame_b64": "...",
  "provider": "ollama"
}
```

The response is a structured judgment: verdict, rationale, criterion evidence,
observed objects, source, and identifiers. The API associates that response
with the session.

### Provenance and epistemic limits

- Set `source` with enough detail to interpret the judgment later:
  `<provider>:<model-id>[:params]` (e.g. `ollama:llama3.2-vision:temp=0`),
  `human:<id>`, `hybrid:<recipe>`, or `mock:deterministic`. A bare family
  name is insufficient for eval.
- Criterion evidence may include `method` (`instrument` |
  `display_readout` | `operator_attested` | `visual_estimate`),
  `measured_value`, and `measured_unit` (canonical units only). Omitting
  `method` means visual estimate.
- `observed_objects[].confidence` is a producer self-report in `[0, 1]`. It
  is **not** a calibrated probability and must not be thresholded or
  averaged across model versions as if it estimated P(correct).
- Judgments are recorded observations. Re-running the same provider against
  the same frame is not guaranteed to reproduce the same verdict.

## Providers

| Provider | Use | Configuration |
|---|---|---|
| `ollama` | Default local model runtime | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `lmstudio` | Local OpenAI-compatible runtime | `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL` |
| `mock` | Deterministic integration tests | No external service |

Set the default with `OPENLABOS_PROVIDER`. A request-level `provider` overrides
it.

Additional provider modules are experimental and are not registered on
`/v1/judgments`.

## Failure behavior

`GET /v1/healthz` proves that the process is running and reports the configured
default provider. It does **not** prove that Ollama or LM Studio is reachable
or that a model is loaded.

`POST /v1/judgments` returns:

- HTTP 400 when `provider` is not one of `ollama`, `lmstudio`, or `mock`
- HTTP 422 when the request does not satisfy the FastAPI input model
- HTTP 502 when Ollama or LM Studio cannot be reached or returns unusable
  output

The mock provider always returns `indeterminate`; it verifies the response
contract and does not inspect frames.

## Adding a provider

Provider implementations live in
`openlabos_inference/providers/`. To expose a provider on the active endpoint:

1. implement `render_judgment(request)` and return the complete judgment shape;
2. define a provider-specific exception for transport and output failures;
3. register the provider name and exception in
   `api/routes/openlabos_judgments.py`;
4. add tests for valid output, unavailable upstream service, malformed model
   output, and request-level selection.

Do not add session storage or step-advancement logic here. Those remain API
responsibilities.

## Legacy application

`uv run openlabos-inference-legacy` starts the older stateful FastAPI
application in `main.py`. It retains protocol/media/session routes for
migration work, but Compose does not use it.

Send new judgment integrations through `/v1/judgments`.

## Related

- [First successful run](../../docs/runbooks/first-successful-run.md)
- [Docker Compose](../../docs/runbooks/docker-compose.md)
- [Writing guide](../../docs/WRITING.md)
