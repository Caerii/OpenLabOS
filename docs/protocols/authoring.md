# Writing a protocol

A protocol is a JSON document validated by `packages/protocol`. This guide
walks through the schema field by field, shows how to validate a draft, and
explains how each field is used at run time. The three documents under
`examples/protocols/` are working references:

- `kitchen-tea.protocol.json` — the five-step demo used by every smoke test
- `buffer-prepare.protocol.json` — a minimal wet-lab workflow
- `spin-coat-photoresist.protocol.json` — a six-step cleanroom workflow with
  measurement criteria and real safety notes

## Document shape

```json
{
  "protocol_id": "buffer-prepare",
  "protocol_version": "1.1.0",
  "name": "Buffer preparation",
  "description": "Optional prose shown in protocol pickers.",
  "modules": [],
  "steps": [ ... ]
}
```

| Field | Rules | Used for |
|---|---|---|
| `protocol_id` | non-empty; also the filename stem (`<id>.protocol.json`) | Session records, run index, API lookup at `/api/protocols/:protocol_id` |
| `protocol_version` | semver (`1.0.0`, `2.1.0-rc.1`) | Frozen into every session; compatibility policy in decision 0003 |
| `name` | non-empty | Protocol pickers and run headers |
| `description` | optional | Protocol pickers |
| `modules` | string list, default `[]` | Reserved for domain modules; leave empty until the module contract ships |
| `steps` | at least one step | Everything below |

Increment `protocol_version` whenever you change a step. Sessions record the
version they ran, so an edited document with an unchanged version makes old
runs unreproducible.

## Identifier vocabulary

Every object, surface, action, tool, and reagent is a namespaced ID with the
shape `<domain>:<slug>`. The slug is lowercase alphanumeric with `-` or `_`.

| Domain | Example | Meaning |
|---|---|---|
| `object:` | `object:mug` | A physical thing the operator manipulates |
| `surface:` | `surface:counter` | A place things rest on or in |
| `action:` | `action:pour` | A verb the operator performs |
| `tool:` | `tool:wafer-tweezers` | An instrument used to perform actions |
| `reagent:` | `reagent:s1813-photoresist` | A consumable |

IDs are contracts, not display text. The operator sees `label` fields; models
and metrics see IDs. Reuse the same ID for the same thing across steps —
`object:mug` in step 1 must be `object:mug` in step 5, or tracking and
judgments treat them as different objects.

## Anatomy of a step

```json
{
  "step_id": "pour-water",
  "order": 1,
  "title": "Pour hot water into the mug",
  "instruction": "Pour hot water into the mug until it is roughly 80% full.",
  "expected_objects": [
    { "object_id": "object:mug", "label": "mug", "optional": false },
    { "object_id": "object:kettle", "label": "kettle", "optional": false }
  ],
  "expected_action": {
    "action_id": "action:pour",
    "label": "Pour",
    "target_object_id": "object:mug",
    "instrument_id": "object:kettle"
  },
  "success_criteria": [
    {
      "kind": "liquid_in_object",
      "container_id": "object:mug",
      "fill_fraction": 0.8,
      "description": "mug fill at roughly 80%"
    }
  ],
  "failure_modes": [
    { "kind": "spill", "description": "water visibly spilled outside the mug" }
  ],
  "safety_notes": [
    "Hot water — pour steadily, keep the kettle spout close to the rim."
  ]
}
```

Field notes:

- **`step_id`** is the stable reference. Session events, judgments, and
  frames all point at `step_id`, never at the array position. Choose slugs
  you can keep when steps are inserted or reordered.
- **`order`** only sorts steps for display. Renumber freely; nothing else
  depends on it.
- **`instruction`** is read aloud by voice cues and shown as the primary
  operator text. Write it as one imperative sentence with the completion
  condition included ("until it is roughly 80% full"), because that sentence
  is also part of the judgment prompt.
- **`expected_objects`** requires at least one entry. Despite the field name,
  it accepts object, surface, tool, and reagent IDs — list everything the
  camera should see for this step. `optional: true` marks items that may
  legitimately be absent. These entries become object-detection prompts and
  the "Expected objects" panel in the run view.
- **`expected_action`** is required and names the single verb being judged.
  `target_object_id` must be an `object:` ID; `instrument_id` may be an
  `object:` or `tool:` ID. If a step seems to need two actions, split it into
  two steps.
- **`safety_notes`** are free-form strings displayed verbatim, styled as
  warnings. They are the only field intended for prose safety content.

## Success criteria

`success_criteria` requires at least one entry. Each is a typed predicate,
and the `kind` decides which other fields are required:

| `kind` | Required fields | Checks that |
|---|---|---|
| `object_on_surface` | `object_id`, `surface_id` | An object rests on a named surface |
| `liquid_in_object` | `container_id`; optional `fill_fraction` (0–1) | A container holds liquid, optionally near a fill level |
| `component_added` | `container_id`, `component_id` (object or reagent) | Something was added into a container |
| `action_performed` | `action_id`; optional `target_object_id`, `instrument_id`, `min_count` | A verb happened, optionally n times |
| `measurement_in_range` | `quantity` (snake_case), `unit` (canonical); optional `min`, `max` | Acceptance range for a named quantity |

Every criterion also requires a human-readable `description`. Models cite the
description as evidence, so make it observable from a camera frame: "amber
resist puddle visible at wafer centre" gives a vision model something to
confirm; "sample is ready" does not.

### Evidence channels — what a criterion can actually prove

Declaring a criterion does **not** measure anything. Today the live path's
default evidence channel is a camera frame judged by a vision model (or the
deterministic mock). That is enough for placement and presence checks. It is
not enough to claim that a tachometer held 4000 ± 50 rpm or that a buffer
reached pH 7.6 unless a number was obtained by a stronger method.

When a judgment records criterion evidence, it may include:

| Field | Meaning |
|---|---|
| `method` | `instrument`, `display_readout`, `operator_attested`, or `visual_estimate` (default if omitted) |
| `measured_value` | The number actually observed |
| `measured_unit` | Must be a canonical unit (same vocabulary as the criterion) |

A `satisfied: true` on `measurement_in_range` with `method: visual_estimate`
(or with `method` omitted) is an estimate of the range check, not a
measurement of the quantity. Prefer `instrument` or `display_readout` when a
real reading exists, and also append a `measurement_recorded` session event
so the value lives in the append-only log with provenance.

### Canonical units and quantity names

`quantity` must be lowercase snake_case (`buffer_ph`, `spin_speed`).
`unit` must be one of the closed set in
`packages/protocol/src/vocabulary.ts` — for example `C`, `K`, `mL`, `L`,
`rpm`, `s`, `pH`, `M`, `mM`, `percent`. Do not invent spellings (`celsius`,
`°C`, `mls`); extend the vocabulary by PR so eval can compare values without
normalization.

Example from the spin-coat protocol:

```json
{
  "kind": "measurement_in_range",
  "quantity": "hotplate_temperature",
  "unit": "C",
  "min": 113,
  "max": 117,
  "description": "hotplate at 115 ± 2 °C"
}
```

These five kinds are the complete core set. Domain modules are intended to
register additional kinds later; until that contract ships, express your
check with the closest core kind and a precise description.

## Failure modes

`failure_modes` may be empty, but a good protocol names what "gone wrong"
looks like, because the entries feed judgment prompts and annotator
guidelines. The closed set of kinds:

`missing_object`, `wrong_object`, `wrong_surface`, `wrong_order`, `spill`,
`out_of_range`, `safety_violation`, `other`

Each entry needs a `description`; an optional `references` array can point at
the IDs involved. Prefer specific descriptions ("wafer placed polished side
down") over generic restatements of the kind.

## Validate a draft

The schema is the authority, and validation failures name the exact path:

```bash
pnpm --filter @openlabos/protocol build
node -e "
const { parseProtocolJson } = require('./packages/protocol/dist/index.js');
const fs = require('node:fs');
parseProtocolJson(fs.readFileSync('examples/protocols/my-protocol.protocol.json', 'utf8'));
console.log('valid');
"
```

A failed parse prints one line per problem, for example:

```text
steps.2.expected_action.target_object_id: must look like "object:something"
steps.0.success_criteria.0.kind: Invalid discriminator value. Expected 'object_on_surface' | ...
```

Common failures:

- `expected_objects` empty — every step needs at least one visible entity
- `expected_action` missing — it is required on every step
- criterion `kind` not one of the five core kinds
- `unit` outside the canonical vocabulary (use `C`, not `celsius`)
- `quantity` not lowercase snake_case
- `target_object_id` given a `tool:` or `surface:` ID — it must be `object:`
- version string not semver

## Run it

Name the file `<protocol_id>.protocol.json` and place it in
`examples/protocols/`. The API serves that directory:

```bash
curl http://localhost:3847/api/protocols
curl http://localhost:3847/api/protocols/buffer-prepare
```

Start a session against it (any adapter ID works for a software-only run):

```bash
curl -X POST http://localhost:3847/api/sessions \
  -H "content-type: application/json" \
  -d '{
    "protocol_id": "buffer-prepare",
    "protocol_version": "1.1.0",
    "device_adapter_id": "manual-test",
    "tags": ["authoring"]
  }'
```

Then drive it with events and judgments — see
[First successful run](../runbooks/first-successful-run.md) for the full
sequence, and `scripts/compose-protocol-run.mjs` for a scripted example that
walks every step of a protocol document.

## What a model sees

When a step check runs, the inference service receives the step's `title`,
`instruction`, `expected_objects`, and `success_criteria`, plus a frame. The
prompt enumerates the criteria by index and asks for a verdict with per-
criterion evidence. Consequences for authors:

1. Anything you want the model to verify must be in the instruction or in a
   criterion description. The model does not see other steps, the protocol
   description, or your intentions.
2. Criteria are judged from a single frame by default. A criterion that
   requires observing motion over time ("stirred for 30 seconds") judges
   poorly from one frame; prefer an end-state phrasing ("tea colour visibly
   diffused through the water") or a recorded duration measurement when
   instrumentation exists.
3. `observed_objects[].confidence` values from models are uncalibrated
   self-reports, not probabilities. Do not design protocols that depend on
   a confidence threshold unless you have calibrated that producer.

Working examples: `kitchen-tea` (visual placement), `buffer-prepare` (volume
and pH with explicit measurement criteria), `spin-coat-photoresist`
(cleanroom measurements and safety notes).

## Related

- Schema source: `packages/protocol/src/protocol.ts`
- Versioning policy: `docs/decisions/0003-protocol-versioning.md`
- Kitchen demo walkthrough: [kitchen-tea-v1.md](kitchen-tea-v1.md)
