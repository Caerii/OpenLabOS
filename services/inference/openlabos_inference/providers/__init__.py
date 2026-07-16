"""
Provider adapters for the OpenLabOS inference service.

Each module in this package wraps a single vendor SDK or local runtime (LM Studio,
Ollama, OpenAI, Anthropic, Google GenAI, Together, RunPod, ...) behind a small,
uniform interface. Higher layers (routes, services) call into a router that picks
the right Provider for a given JudgmentRequest; vendor SDK calls live nowhere
else in the codebase. To add a new backend, drop a `*Provider` class into a new
module here and register it in the router.
"""
