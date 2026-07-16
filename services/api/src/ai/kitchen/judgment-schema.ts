import { z } from "zod";

// Keep this aligned with `openlabos-training/packages/protocol-schema/src/vocabulary.ts`
export const ObjectIdSchema = z.enum([
  "mug",
  "kettle",
  "tea_bag",
  "spoon",
  "tray",
  "pot",
  "stove",
  "bowl",
  "noodles",
  "seasoning_packet",
]);
export const ActionIdSchema = z.enum(["place", "pour", "add", "stir"]);
export const IssueIdSchema = z.enum(["missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other"]);

export const JudgmentResultSchema = z.object({
  step_id: z.string().min(1),
  judgment_schema_version: z.string().min(1).optional(),
  objects_seen: z.array(ObjectIdSchema),
  action_detected: ActionIdSchema.nullable(),
  step_complete: z.boolean(),
  possible_issue: IssueIdSchema.nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export type JudgmentResult = z.infer<typeof JudgmentResultSchema>;

