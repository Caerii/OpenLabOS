# 0007 — Operator surfaces

- Status: accepted
- Scope: `apps/web`, `apps/device-reference`, future surfaces

## Context

The operator is moving — gloved, sometimes hands-busy, often staring at a
bench rather than a monitor. A desktop dashboard alone fails them; a head-up
display alone fails the supervisor reading transcripts. We need at least
two surfaces with shared semantics.

## Decision

Two first-class operator surfaces:

- **`apps/web`** is a tablet- and laptop-first responsive React app. It is
  the supervisor's view, the protocol authoring tool, and the only place
  that runs offline against a static bundle.
- **`apps/device-reference`** is the head-up surface. It implements the
  `DeviceAdapter` interface, renders the next step in a low-distraction
  card, and emits frames + sensor samples upstream. Vendor variants are
  forks under `adapters/` that reuse most of this code.

Both surfaces consume the same `services/api` HTTP contract and the same
generated TypeScript SDK. There is no "tablet protocol" or "glasses
protocol" — there are just `Protocol` documents and screen-shape choices.

## Consequences

- Voice and audio cues are first-class for the device surface; the web
  surface treats them as optional.
- A protocol authored on the laptop runs on the glasses without conversion.
- Designers pay the cost of "works on a 1024×768 tablet and on a 640×480
  HUD" once, in `packages/ui`.

## Alternatives considered

- **Glasses-only.** Closes the supervisor and authoring stories.
- **Web-only.** Loses the in-the-field, hands-busy use case that motivates
  the project.
