import { z } from "zod";
import { MeasurementUnitSchema } from "./vocabulary.js";

/**
 * A judgment is the model's assessment of one frame against one step. The
 * shape is intentionally narrow so that judgments can be:
 *   • produced by humans, VLMs, or hybrid validators with the same schema
 *   • compared deterministically in eval
 *   • used as supervised training labels with no further normalisation
 *
 * Epistemic status: a judgment is a recorded observation, not a reproducible
 * computation. Replaying a session's events reconstructs its state exactly;
 * re-running a model against the same frame does not, in general, reproduce
 * the same judgment (model versions change, sampling is stochastic). This is
 * why `source` must carry full provenance — see JudgmentSchema below.
 */

export const VerdictSchema = z.enum([
  "succeeded",
  "in_progress",
  "failed",
  "indeterminate",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ObservedObjectSchema = z.object({
  object_id: z.string().min(1),
  /**
   * Producer self-report in [0, 1]. This is NOT a calibrated probability:
   * detector scores and VLM self-reports are not comparable to each other or
   * across model versions, and must not be thresholded or averaged as if
   * they estimated P(correct). Treat it as a ranking hint until a
   * calibration measurement (e.g. reliability diagram against labeled data)
   * exists for the specific producer named in `source`.
   */
  confidence: z.number().min(0).max(1),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number().nonnegative(),
      h: z.number().nonnegative(),
    })
    .optional(),
});
export type ObservedObject = z.infer<typeof ObservedObjectSchema>;

/**
 * How a criterion's evidence was obtained. Ordered roughly by evidential
 * strength:
 *   • `instrument`       — a sensor or instrument reported the value through
 *                          a recorded channel
 *   • `display_readout`  — a human or model read a number off a display
 *                          visible in the frame
 *   • `operator_attested`— the operator asserted the condition without a
 *                          recorded reading
 *   • `visual_estimate`  — inferred from the image alone (the default for
 *                          VLM judgments)
 */
export const EvidenceMethodSchema = z.enum([
  "instrument",
  "display_readout",
  "operator_attested",
  "visual_estimate",
]);
export type EvidenceMethod = z.infer<typeof EvidenceMethodSchema>;

export const CriterionEvidenceSchema = z.object({
  /** Index into the step's success_criteria array. */
  criterion_index: z.number().int().nonnegative(),
  satisfied: z.boolean(),
  evidence: z.string().min(1),
  /**
   * How the evidence was obtained. Omitted means `visual_estimate`. A
   * `satisfied: true` on a `measurement_in_range` criterion without an
   * `instrument` or `display_readout` method is an estimate of the range
   * check, not a measurement of the quantity.
   */
  method: EvidenceMethodSchema.optional(),
  /** The value actually observed, when the method produced a number. */
  measured_value: z.number().optional(),
  /** Unit of `measured_value`; must match the criterion's declared unit. */
  measured_unit: MeasurementUnitSchema.optional(),
});
export type CriterionEvidence = z.infer<typeof CriterionEvidenceSchema>;

export const JudgmentSchema = z.object({
  judgment_id: z.string().uuid(),
  session_id: z.string().uuid(),
  step_id: z.string().min(1),
  frame_uri: z.string().min(1),
  emitted_at: z.string().datetime(),
  /**
   * Identifier of the producer, with enough provenance to interpret the
   * judgment after the fact. Convention:
   *   models  — "<provider>:<model-id>[:<params>]",
   *             e.g. "ollama:llama3.2-vision-11b-q4_K_M:temp=0"
   *   humans  — "human:<user-id>"
   *   hybrid  — "hybrid:<recipe>"
   *   mock    — "mock:deterministic"
   * A bare model family name ("gpt-4") is insufficient: judgments from
   * different versions or sampling settings are different distributions and
   * must be distinguishable in eval.
   */
  source: z.string().min(1),
  verdict: VerdictSchema,
  rationale: z.string().min(1),
  observed_objects: z.array(ObservedObjectSchema).default([]),
  criteria: z.array(CriterionEvidenceSchema).default([]),
  /** Optional structured failure attribution. */
  failure: z
    .object({
      kind: z.string().min(1),
      description: z.string().min(1),
    })
    .optional(),
});
export type Judgment = z.infer<typeof JudgmentSchema>;
