import { z } from "zod";
import {
  ActionIdSchema,
  ObjectIdSchema,
  ReagentIdSchema,
  SurfaceIdSchema,
  ToolIdSchema,
} from "./vocabulary.js";

/**
 * Success criteria are extensible by tag. The core ships a small set of
 * structurally-checkable variants; domain modules add more by registering a
 * Zod schema under a new tag and contributing a verifier.
 */
export const CoreSuccessCriterion = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("object_on_surface"),
    object_id: ObjectIdSchema,
    surface_id: SurfaceIdSchema,
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("liquid_in_object"),
    container_id: ObjectIdSchema,
    fill_fraction: z.number().min(0).max(1).optional(),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("component_added"),
    container_id: ObjectIdSchema,
    component_id: z.union([ObjectIdSchema, ReagentIdSchema]),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("action_performed"),
    action_id: ActionIdSchema,
    target_object_id: ObjectIdSchema.optional(),
    instrument_id: z.union([ObjectIdSchema, ToolIdSchema]).optional(),
    min_count: z.number().int().positive().optional(),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("measurement_in_range"),
    quantity: z.string().min(1),
    unit: z.string().min(1),
    min: z.number().optional(),
    max: z.number().optional(),
    description: z.string().min(1),
  }),
]);
export type CoreSuccessCriterion = z.infer<typeof CoreSuccessCriterion>;

export const FailureModeSchema = z.object({
  kind: z.enum([
    "missing_object",
    "wrong_object",
    "wrong_surface",
    "wrong_order",
    "spill",
    "out_of_range",
    "safety_violation",
    "other",
  ]),
  description: z.string().min(1),
  references: z
    .array(z.union([ObjectIdSchema, SurfaceIdSchema, ToolIdSchema, ReagentIdSchema]))
    .optional(),
});
export type FailureMode = z.infer<typeof FailureModeSchema>;

/**
 * "Expected entity" — anything visible in the scene the operator must touch
 * or reference. Despite the historical name, this accepts objects, surfaces,
 * tools, and reagents. The narrower id types are still used wherever the
 * field is *specifically* a surface or a tool.
 */
export const ExpectedObjectSchema = z.object({
  object_id: z.union([
    ObjectIdSchema,
    SurfaceIdSchema,
    ToolIdSchema,
    ReagentIdSchema,
  ]),
  label: z.string().min(1),
  optional: z.boolean().default(false),
});
export type ExpectedObject = z.infer<typeof ExpectedObjectSchema>;

export const ExpectedActionSchema = z.object({
  action_id: ActionIdSchema,
  label: z.string().min(1),
  target_object_id: ObjectIdSchema.optional(),
  instrument_id: z.union([ObjectIdSchema, ToolIdSchema]).optional(),
});
export type ExpectedAction = z.infer<typeof ExpectedActionSchema>;

export const ProtocolStepSchema = z.object({
  step_id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  expected_objects: z.array(ExpectedObjectSchema).min(1),
  expected_action: ExpectedActionSchema,
  success_criteria: z.array(CoreSuccessCriterion).min(1),
  failure_modes: z.array(FailureModeSchema).default([]),
  /** Free-form safety notes shown verbatim to the operator. */
  safety_notes: z.array(z.string().min(1)).default([]),
});
export type ProtocolStep = z.infer<typeof ProtocolStepSchema>;

/**
 * Semver string the API uses for forward-compat checks.
 * See docs/decisions/0003-protocol-versioning.md.
 */
export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, "must be semver, e.g. 1.0.0");

export const ProtocolSchema = z.object({
  protocol_id: z.string().min(1),
  protocol_version: SemverSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Domain modules this protocol relies on (e.g. "biotech", "chemistry"). */
  modules: z.array(z.string().min(1)).default([]),
  steps: z.array(ProtocolStepSchema).min(1),
});
export type Protocol = z.infer<typeof ProtocolSchema>;
