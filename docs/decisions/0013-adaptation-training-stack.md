# 0013 — Adaptation training stack

- Status: accepted
- Scope: `services/training`

## Context

Lab adherence is a long-tail problem: every protocol has its own object
inventory, its own failure modes, and its own near-misses that the base
VLM has not seen. Full fine-tunes are expensive and erode general
capability; we need lightweight adaptation paths and a way to compose
them.

## Decision

The training stack is a small ladder; each rung is independently
runnable and cited in eval.

- **Supervised fine-tuning (SFT)** with **LoRA** adapters on top of the
  baseline VLM. This is the workhorse for new protocols and new domain
  modules. Datasets are hashed and frozen.
- **Direct Preference Optimisation (DPO)** for nudging style (rationale
  shape, abstention behaviour) without re-curating instruction data.
- **Group Relative Policy Optimisation (GRPO)** for criterion-grounded
  reward signals — used sparingly, where success criteria translate
  cleanly into rewards.
- **Judgment-LoRA**: a thinner SFT pass that targets only the structured
  judgment fields. This is the fastest signal and the safest to ship.

Every job emits a manifest naming the base model id, the dataset hash,
the protocol versions covered, and the resulting checkpoint. `services/eval`
consumes that manifest as input.

## Consequences

- Adaptation is a series of small, comparable steps, not one giant
  fine-tune.
- A regression's blast radius is bounded by which rung shipped it.
- New rungs (RLHF, distillation, …) add files; they don't break the
  manifest contract.

## Alternatives considered

- **Full fine-tunes by default.** Too expensive for the iteration cadence
  we want.
- **Prompt engineering only.** Hits a ceiling on adherence quality once
  protocols get specific.
