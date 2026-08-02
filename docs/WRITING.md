# Writing in OpenLabOS

Documentation should let a reader operate, extend, or evaluate the system
without guessing. Prefer precise statements about behavior and boundaries over
claims about quality or intent.

## Principles

### Describe observable behavior

Name the input, operation, and result:

> `compose:restart-persistence` creates a session, restarts the API container,
> and verifies that the session events are still available.

Avoid statements that cannot be checked:

> The persistence layer is robust and production-ready.

### Put maturity beside the claim

Do not describe an experimental path as if setup were sufficient proof. State
the current boundary in the same paragraph:

> The Grounded SAM 2 overlay requires an NVIDIA runtime and model downloads.
> It is an experimental path, not part of the default Compose verification.

Use **working**, **experimental**, **hardware-dependent**, **legacy**, and
**planned** consistently. A directory or interface is not evidence that a
feature works.

### Explain consequences, not intentions

Architecture prose may be reflective when it explains a trade-off:

> Session state belongs to the API, so inference workers can restart without
> changing the active step.

Avoid manifesto language that only announces conviction:

> Session truth is sacred. Everything else is plumbing.

### Do not overstate evidence

A protocol criterion declares what would count as success. A vision judgment
is an observation, not a measurement. Say "the model estimated the fill level"
or "the pH meter reading was recorded," not "the system measured pH," unless
a `measurement_recorded` event or criterion evidence with
`method: instrument` (or `display_readout`) exists. Do not treat
`confidence` as a probability. Do not call event replay "bit-for-bit
reproducibility" of model outputs — only of session state.

### Preserve technical nouns

Engineering documentation should use canonical contract names such as
`Protocol`, `Session`, `Judgment`, and `RunManifest`. Define each term once.
Do not replace a schema name with friendlier copy if the schema itself is the
subject.

Operator interfaces should use task language:

| Engineering term | Operator label |
|---|---|
| inference gateway | step-check service |
| perception sidecar | object detection |
| adherence decision | step check |
| realtime supervisor | auto-check |
| `RunManifest` | saved run |
| Hono session / coordination API | session / API |

## Structure by document type

### Runbooks

Begin with the outcome, prerequisites, and commands. Follow with expected
results and troubleshooting. Background belongs after the runnable path.

### Service READMEs

Define ownership first: what the service accepts, returns, stores, and does not
own. Then document startup, health semantics, runtime contracts, failure
behavior, and extension points.

### Architecture documents

State current behavior before target design. Label conceptual interfaces and
migration endpoints. Explain why a boundary exists and what would break if it
were crossed.

### Product and operator copy

Answer three questions in order:

1. What can I do?
2. What must be configured?
3. What will be saved or changed?

Do not expose migration names, transport details, or provider internals unless
the operator can act on them.

Use tables for ports, environment variables, file layouts, and genuine
comparisons. Use prose for causal explanations. Do not duplicate the same
status inventory across several pages; link to the roadmap or service README.

Use acronyms only when the reader needs them to run a command or understand a
contract. Expand an acronym the first time it appears.

## Style

- Prefer active voice when ownership matters: “The API stores session events.”
- Use concrete nouns and verbs: protocol, frame, append, validate, restart.
- Keep one main claim per paragraph.
- Avoid promotional filler: *seamless*, *robust*, *powerful*, *ecosystem*,
  *unlock*, *production-ready*.
- Avoid conversational asides, campaign history, and criticism of earlier
  wording.
- Avoid slogan fragments and rhetorical declarations in reference
  documentation.
- Use sentence case for headings and controls.

## Review checklist

Before merging:

1. Verify every path, command, port, and environment variable that changed.
2. Check each capability claim against the implementation and roadmap.
3. Distinguish the default path from optional hardware, provider, and GPU
   paths.
4. Confirm that canonical schema names remain intact in engineering docs.
5. Remove repeated conclusions and unsupported adjectives.
6. Read operator copy without repository context; every label should imply an
   available action or state.
