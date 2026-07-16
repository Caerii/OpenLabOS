/**
 * Judgments are the model's verdict on one frame. Tests here pin the core
 * contract: a judgment is unambiguous, sourced, and indexed back to the
 * specific success criteria of the step it judged.
 */
import { describe, expect, it } from "vitest";
import { JudgmentSchema } from "../src/judgment.js";

const SID = "00000000-0000-4000-8000-000000000001";
const JID = "00000000-0000-4000-8000-000000000099";

const minimal = {
  judgment_id: JID,
  session_id: SID,
  step_id: "place-mug",
  frame_uri: "file:///tmp/frame.jpg",
  emitted_at: "2026-05-04T17:00:00.000Z",
  source: "model:gemini-2.5-pro",
  verdict: "succeeded" as const,
  rationale: "mug visibly upright on counter",
  observed_objects: [],
  criteria: [],
};

describe("JudgmentSchema", () => {
  it("accepts a minimal succeeded judgment", () => {
    expect(() => JudgmentSchema.parse(minimal)).not.toThrow();
  });

  it("requires a non-empty rationale", () => {
    expect(() => JudgmentSchema.parse({ ...minimal, rationale: "" })).toThrow();
  });

  it("rejects a verdict outside the allowed set", () => {
    expect(() =>
      JudgmentSchema.parse({ ...minimal, verdict: "maybe" }),
    ).toThrow();
  });

  it("clamps confidence to [0, 1] for observed objects", () => {
    expect(() =>
      JudgmentSchema.parse({
        ...minimal,
        observed_objects: [{ object_id: "object:mug", confidence: 1.5 }],
      }),
    ).toThrow();
  });

  it("indexes criterion evidence back to the step's success_criteria array", () => {
    const j = JudgmentSchema.parse({
      ...minimal,
      criteria: [
        {
          criterion_index: 0,
          satisfied: true,
          evidence: "mug center within counter polygon",
        },
      ],
    });
    expect(j.criteria[0]?.criterion_index).toBe(0);
  });
});
