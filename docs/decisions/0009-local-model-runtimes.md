# 0009 — Local model runtimes

- Status: accepted
- Scope: `services/inference`

## Context

For OpenLabOS to be useful offline, it has to be able to ask a model
"did the operator place the mug on the counter?" without internet. Several
local runtimes can answer this — Ollama, LM Studio, llama.cpp via vLLM, an
in-process runner — and they trade off ease, speed, and model coverage
differently. We need the inference service to support more than one
without forking it.

## Decision

`services/inference` exposes one `Provider` interface that local runtimes
implement alongside cloud SDKs. The default development runtime is
**Ollama** (best out-of-box experience, no GUI required). **LM Studio**
remains supported for users who already run it. **vLLM** is the
recommended runtime when a GPU is dedicated to a single model. **llama.cpp
direct** is supported through a thin in-process provider for embedded and
laptop scenarios.

Selection is config-driven; the operator never edits code to switch.

## Consequences

- We commit to keeping at least two local providers green in CI. They
  share the request/response contract; failures point quickly at the
  provider layer.
- Latency budgets and prompt formats are documented per provider; the
  router picks the right one for the right job.
- Cloud is wired through the same interface, so a deployment can mix and
  match.

## Alternatives considered

- **One blessed runtime.** Locks the operator's hand; many labs already
  have a runtime they like.
- **An external broker (LiteLLM, OpenRouter).** Useful for cloud sprawl;
  unnecessary friction for a local-first default.
