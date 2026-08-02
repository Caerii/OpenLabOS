# Kitchen tea demo protocol

The kitchen tea demo has five fixed steps. Its machine-readable protocol is
[`examples/protocols/kitchen-tea.protocol.json`](../../examples/protocols/kitchen-tea.protocol.json)
and is validated by `@openlabos/protocol`.

## Intent

An operator wearing a point-of-view camera makes tea with a **mug**, **kettle**,
**tea bag**, **spoon**, and **tray**. Checks are limited to the objects, actions,
surfaces, and problems named in the protocol.

## Stable step ids

All session state and model judgments refer to steps by `**step_id`**, not by array index:


| Order | `step_id`              | Title                |
| ----- | ---------------------- | -------------------- |
| 0     | `place-mug`            | Place mug on counter |
| 1     | `pour-water`           | Pour water into mug  |
| 2     | `add-tea-bag`          | Add tea bag          |
| 3     | `stir`                 | Stir with spoon      |
| 4     | `place-on-tray`        | Place mug on tray    |


`order` exists only to sort steps in the UI.

## Closed vocabulary (summary)

- **Objects:** `mug`, `kettle`, `tea_bag`, `spoon`, `tray`
- **Actions:** `place`, `pour`, `add`, `stir`
- **Surfaces / locations:** `counter`, `tray`, `inside_mug`
- **Judgment issues (structured):** e.g. `missing_object`, `wrong_surface`, `spill` (see schema package for full list)

Display names for UI and prompts come from **label** fields and label maps in code, not from ad hoc strings in new fields.

## Step-by-step narrative

1. **Place mug on counter** — The mug should be visible and resting on the **counter** surface before pouring.
2. **Pour water into mug** — Water from the **kettle** should end up **in the mug** (liquid-in-container criterion).
3. **Add tea bag** — A **tea bag** should be placed **inside the mug** (component-added criterion with `inside_mug` surface).
4. **Stir with spoon** — The **spoon** should stir inside the **mug**.
5. **Place mug on tray** — The **mug** should be placed on the **tray** surface (same criterion type as step 1, different surface).

## Success criteria and failures

Each step lists **success_criteria** as small structured records (`criterion_type` plus optional object/surface references) and a human **description**. **failure_modes** describe what “gone wrong” looks like for operators and annotators.

Automated eval and LM prompts should prefer these structured fields over free prose inside descriptions.

## Judgments

Each `Judgment` records a `step_id`, `verdict`, structured `criteria`
evidence (indexed into this protocol's `success_criteria`), optional
`observed_objects`, and a `rationale` that is explanatory only — metrics
must use the structured fields, not parsed natural language from
`rationale`. Object `confidence` values are uncalibrated producer
self-reports. Kitchen-tea steps are visual placement and action checks;
they do not claim instrument measurements.

## Related documents

- [Writing a protocol](authoring.md) — the schema field by field, with
  validation and run instructions
- decision 0011 — closed-world decision and vocabulary discipline
- `packages/protocol/src/protocol.ts` — schema source of truth