# Protocol: Kitchen tea (closed-world demo)

This document describes the **kitchen-tea-v1** demo protocol in plain language. The machine-readable source of truth is `[packages/protocol-schema/examples/kitchen-tea-v1.json](../../packages/protocol-schema/examples/kitchen-tea-v1.json)`, validated by Zod schemas in `@labos/protocol-schema`.

## Intent

An operator wearing POV capture follows five fixed steps to make tea with a **mug**, **kettle**, **tea bag**, **spoon**, and **tray**. The system never tries to understand arbitrary lab tasks in this MVP; it only reasons about the enumerated objects, actions, surfaces, and issues defined in the schema package.

## Stable step ids

All session state and model judgments refer to steps by `**step_id`**, not by array index:


| Order | `step_id`              | Title                |
| ----- | ---------------------- | -------------------- |
| 0     | `place-mug-on-counter` | Place mug on counter |
| 1     | `pour-water-into-mug`  | Pour water into mug  |
| 2     | `add-tea-bag`          | Add tea bag          |
| 3     | `stir-with-spoon`      | Stir with spoon      |
| 4     | `place-mug-on-tray`    | Place mug on tray    |


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

## Judgments (preview)

When the VLM integration lands, each **JudgmentResult** will include the same `**step_id`**, structured detections (`objects_seen`, `action_detected`, `step_complete`, `possible_issue`, `confidence`), and a `**reason` string** that is **explanatory only**—metrics must use the structured fields, not parsed natural language from `reason`.

## Related documents

- decision 0011 — closed-world decision and vocabulary discipline
- `packages/protocol-schema/README.md` — schema invariants and scripts