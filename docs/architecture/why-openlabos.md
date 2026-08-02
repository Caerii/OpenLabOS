# Why OpenLabOS exists

OpenLabOS is an open protocol runner for camera-assisted laboratory work. It
exists so that a versioned procedure, the operator’s actions, and any attached
evidence can be kept as one inspectable record — without forcing a cloud
vendor, a closed instrument platform, or a proprietary notebook format.

This page states the problem the repository is trying to solve and where the
current software stops. For setup, start at the root `README.md`. For how a
run moves through the code, read
[literate-architecture.md](literate-architecture.md).

## The problem

A laboratory protocol is more than a checklist. After a run, someone later
needs to answer questions that video alone cannot answer:

- Which protocol *version* was active?
- Which step was current when a frame was captured?
- Did the run advance because an operator confirmed, a policy fired, or a
  model returned a verdict — and which producer was that?
- Was a numeric claim measured by an instrument, read from a display, attested
  by the operator, or estimated from a camera frame?

Commercial systems often answer those questions inside a product boundary you
cannot fork. Pure ML repositories answer model-quality questions but do not
own the live run. Robot stacks own motion; ELNs own samples and forms. The gap
is an open **execution-and-evidence** layer: guide the operator through a
protocol, append what happened, and leave a record that review and evaluation
can consume.

## What OpenLabOS treats as primary

The unit of work is one execution of one protocol: a `Session`.

| Record | Role |
| --- | --- |
| `Protocol` | Versioned steps, criteria, and vocabulary |
| `Session` | One attempt; status and metadata |
| `SessionEvent` | Append-only history that reconstructs live state |
| `Judgment` | A producer’s structured verdict on a step (observation, not a recomputation) |
| `RunManifest` | Intended closure for review, replay of state, and offline learning |

Shared schemas live in `packages/protocol`. Services may be replaced; the
meaning of a run should not have to be reinvented each time.

## Design consequences

**Planes stay separate.** The web console presents the run. The API owns
session state and device routing. Inference and perception produce judgments
and observations but do not own the session. Training and evaluation run
offline on saved records. A model outage must not erase what the operator did.

**Hardware stays behind adapters.** Protocols and sessions refer to adapter
ids and capabilities, not brand-specific wire protocols. Android is
implemented; webcam is a scaffold; ROS 2 and serial remain planned.

**Cloud stays optional.** The default Compose path binds to loopback, uses
deterministic perception, and does not require provider credentials. Local
models (Ollama, LM Studio) are opt-in. That is a deliberate boundary for labs
that cannot send frames off-site.

**Evidence must name its method.** A `measurement_in_range` criterion
declares an acceptance band. It becomes a measurement only when
`measurement_recorded` or criterion evidence carries `instrument` or
`display_readout`. Visual estimates and omitted methods are estimates.
Object `confidence` values are uncalibrated producer self-reports until a
producer is calibrated. Replaying events reconstructs session state; it does
not reproduce stochastic model judgments.

## What this is not

OpenLabOS is pre-1.0 research software. It is not a validated LIMS, not a
clinical or diagnostic device, not a turnkey manufacturing execution system,
and not a claim that vision models are accurate enough for safety decisions.
Capability status is tracked in [roadmap.md](roadmap.md).

## Where the open-source bet lands

If the project succeeds, the win is not a prettier demo of making tea. It is
that labs and researchers can **own protocol definitions, session histories,
and judgment provenance**, plug in cameras and models they trust, and still
speak a shared language for audit and evaluation.

That is the commons this repository is trying to grow: reproducible procedure
execution as inspectable software, not as a feature of one company’s cloud.
