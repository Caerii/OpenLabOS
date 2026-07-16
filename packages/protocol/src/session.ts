import { z } from "zod";

/**
 * A session is one operator running one protocol once. It is the unit of
 * reproducibility: a frozen `protocol_version`, a deterministic event log, and
 * a final manifest you can replay or audit.
 */

export const SessionStatusSchema = z.enum([
  "pending",
  "active",
  "completed",
  "abandoned",
  "errored",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  session_id: z.string().uuid(),
  protocol_id: z.string().min(1),
  protocol_version: z.string().min(1),
  device_adapter_id: z.string().min(1),
  operator_id: z.string().optional(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  status: SessionStatusSchema,
  /** Open-ended labels for filtering datasets later. */
  tags: z.array(z.string().min(1)).default([]),
});
export type Session = z.infer<typeof SessionSchema>;

/**
 * Events are append-only. Replaying them in order reconstructs the session
 * state exactly. Anything that mutates session state must emit one.
 */
export const SessionEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("step_started"),
    at: z.string().datetime(),
    step_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("frame_captured"),
    at: z.string().datetime(),
    step_id: z.string().min(1),
    frame_uri: z.string().min(1),
    sensor_snapshot_uri: z.string().optional(),
  }),
  z.object({
    kind: z.literal("judgment_emitted"),
    at: z.string().datetime(),
    step_id: z.string().min(1),
    judgment_id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("step_completed"),
    at: z.string().datetime(),
    step_id: z.string().min(1),
    succeeded: z.boolean(),
  }),
  z.object({
    kind: z.literal("operator_note"),
    at: z.string().datetime(),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("session_finalized"),
    at: z.string().datetime(),
    status: SessionStatusSchema,
  }),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;
