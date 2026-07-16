# 0012 — Vision-language baseline

- Status: accepted
- Scope: `services/inference`, `services/training`, `services/eval`

## Context

The reasoning plane needs a default vision-language model to evaluate
against and to fine-tune from. Picking one too tightly couples the system;
having none means every contributor argues the choice from scratch.

## Decision

We name a baseline rather than a requirement.

- The default open VLM is the **Qwen-VL** family (currently
  `Qwen2.5-VL-7B-Instruct` for laptop GPUs, `Qwen3.5-VL-9B` for L40s and
  similar). The choice tracks open-weight progress and is updated by a
  follow-up decision when something materially better arrives.
- Cloud baselines for comparison: a current Gemini family vision model,
  GPT-4o-class, and Claude vision. These are eval-only baselines unless
  the operator explicitly opts into cloud routing.
- Eval reports always cite the model id and version they were produced
  against. A run is meaningful only relative to its baseline.

## Consequences

- Newcomers have a known good starting point.
- Swapping in a new model is a config change; no code path assumes
  the baseline.
- Any "the system gets X% on Y" claim is auditable to a checkpoint hash.

## Alternatives considered

- **No baseline named.** Decisions get made in side-channels; new
  contributors waste a week.
- **Closed-weights baseline.** Useless for replication and offline
  scenarios.
