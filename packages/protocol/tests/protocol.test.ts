/**
 * Protocol schema acceptance tests.
 *
 * The story: a protocol document survives a round-trip through `parse`, then
 * a serialize-and-reparse, with no semantic drift. Every feature added to the
 * schema gets a positive case (it accepts a valid example) and a negative
 * case (it rejects the obvious mistake), so a future reader can see the
 * intended contract from the tests alone.
 */
import { describe, expect, it } from "vitest";
import {
  ProtocolSchema,
  ProtocolStepSchema,
  type Protocol,
} from "../src/protocol.js";
import kitchenTea from "../../../examples/protocols/kitchen-tea.protocol.json" with { type: "json" };

describe("ProtocolSchema", () => {
  it("accepts the canonical kitchen-tea example", () => {
    const parsed = ProtocolSchema.parse(kitchenTea);
    expect(parsed.protocol_id).toBe("kitchen-tea");
    expect(parsed.steps).toHaveLength(5);
  });

  it("round-trips through JSON without drift", () => {
    const parsed = ProtocolSchema.parse(kitchenTea);
    const round = ProtocolSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(round).toEqual(parsed);
  });

  it("rejects a protocol with zero steps", () => {
    const bad = { ...(kitchenTea as Protocol), steps: [] };
    expect(() => ProtocolSchema.parse(bad)).toThrow();
  });

  it("rejects a non-semver protocol_version", () => {
    const bad = { ...(kitchenTea as Protocol), protocol_version: "v1" };
    expect(() => ProtocolSchema.parse(bad)).toThrow(/semver/);
  });
});

describe("ProtocolStepSchema", () => {
  const baseStep = {
    step_id: "place-mug",
    order: 0,
    title: "Place the mug",
    instruction: "Place the mug on the counter.",
    expected_objects: [{ object_id: "object:mug", label: "mug", optional: false }],
    expected_action: { action_id: "action:place", label: "Place" },
    success_criteria: [
      {
        kind: "object_on_surface" as const,
        object_id: "object:mug",
        surface_id: "surface:counter",
        description: "mug rests on counter",
      },
    ],
    failure_modes: [],
    safety_notes: [],
  };

  it("accepts a minimal valid step", () => {
    expect(() => ProtocolStepSchema.parse(baseStep)).not.toThrow();
  });

  it("rejects a step with no expected objects", () => {
    expect(() =>
      ProtocolStepSchema.parse({ ...baseStep, expected_objects: [] }),
    ).toThrow();
  });

  it("rejects an object_id that breaks the namespacing rule", () => {
    expect(() =>
      ProtocolStepSchema.parse({
        ...baseStep,
        expected_objects: [{ object_id: "mug", label: "mug", optional: false }],
      }),
    ).toThrow(/object:something/);
  });

  it("accepts every core success-criterion kind", () => {
    const variants = [
      {
        kind: "object_on_surface",
        object_id: "object:beaker",
        surface_id: "surface:bench",
        description: "x",
      },
      {
        kind: "liquid_in_object",
        container_id: "object:beaker",
        fill_fraction: 0.5,
        description: "x",
      },
      {
        kind: "component_added",
        container_id: "object:beaker",
        component_id: "reagent:tris-buffer",
        description: "x",
      },
      {
        kind: "action_performed",
        action_id: "action:stir",
        min_count: 5,
        description: "x",
      },
      {
        kind: "measurement_in_range",
        quantity: "bath_temperature",
        unit: "C",
        min: 36,
        max: 38,
        description: "x",
      },
    ] as const;
    for (const v of variants) {
      expect(() =>
        ProtocolStepSchema.parse({ ...baseStep, success_criteria: [v] }),
      ).not.toThrow();
    }
  });

  it("rejects a measurement unit outside the canonical vocabulary", () => {
    expect(() =>
      ProtocolStepSchema.parse({
        ...baseStep,
        success_criteria: [
          {
            kind: "measurement_in_range",
            quantity: "bath_temperature",
            unit: "celsius",
            min: 36,
            max: 38,
            description: "x",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a quantity name that is not snake_case", () => {
    expect(() =>
      ProtocolStepSchema.parse({
        ...baseStep,
        success_criteria: [
          {
            kind: "measurement_in_range",
            quantity: "Bath Temperature",
            unit: "C",
            min: 36,
            max: 38,
            description: "x",
          },
        ],
      }),
    ).toThrow(/snake_case/);
  });
});
