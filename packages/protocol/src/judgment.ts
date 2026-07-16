import { z } from "zod";

/**
 * A judgment is the model's assessment of one frame against one step. The
 * shape is intentionally narrow so that judgments can be:
 *   • produced by humans, VLMs, or hybrid validators with the same schema
 *   • compared deterministically in eval
 *   • used as supervised training labels with no further normalisation
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

export const CriterionEvidenceSchema = z.object({
  /** Index into the step's success_criteria array. */
  criterion_index: z.number().int().nonnegative(),
  satisfied: z.boolean(),
  evidence: z.string().min(1),
});
export type CriterionEvidence = z.infer<typeof CriterionEvidenceSchema>;

export const JudgmentSchema = z.object({
  judgment_id: z.string().uuid(),
  session_id: z.string().uuid(),
  step_id: z.string().min(1),
  frame_uri: z.string().min(1),
  emitted_at: z.string().datetime(),
  /** Identifier of the producer: model id, user id, or "hybrid:<recipe>". */
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
