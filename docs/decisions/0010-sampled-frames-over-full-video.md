# 0010 — Sampled frames over full video

- Status: accepted
- Scope: `services/api`, `services/inference`, `services/training`

## Context

A protocol step lasts ten to ninety seconds. A 30 fps capture across that
window is hundreds to thousands of frames. Most are nearly identical;
sending them all to a vision model is wasteful, and storing them all is
worse. But sometimes the *one* frame that matters is the one we'd skip.

## Decision

Capture is rolling video; storage and judgment work on **sampled
frames** with a deterministic selection policy.

- Default cadence: 1 frame per second during a step, plus event-anchored
  frames (operator confirmation, audible cue, sensor spike).
- Selection happens in `services/inference` from a frame source the device
  adapter exposes; the API is given URIs, not raw bytes.
- For training and eval, a *richer* sampler can produce the same decisions
  on a different cadence. Sample policy is part of the dataset hash.

Full-video clips are kept by the device adapter for a configurable
recent-history window so an operator can rewind, but they are not the
unit of analysis.

## Consequences

- Cost and latency are bounded by step duration, not capture rate.
- The "right" frame is reachable through event anchors even when the
  default cadence misses it.
- Training data is naturally aligned with what the runtime sees.

## Alternatives considered

- **Process every frame.** Linear in capture rate; we can always opt in
  per step where the protocol genuinely needs it.
- **Operator-marked frames only.** Loses inattentional failures we
  specifically want to catch.
