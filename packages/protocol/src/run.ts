import { z } from "zod";
import { JudgmentSchema } from "./judgment.js";
import { SessionEventSchema, SessionSchema } from "./session.js";

/**
 * A run manifest is the closure over a session: protocol id+version, every
 * event, every judgment, plus pointers to the artifacts on disk. It is the
 * thing training and eval consume; the thing reviewers audit; the thing a
 * regression suite replays bit-for-bit.
 */
export const RunManifestSchema = z.object({
  manifest_version: z.literal(1),
  session: SessionSchema,
  /** Hash of the protocol document at run-time, for forward-compat checks. */
  protocol_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  events: z.array(SessionEventSchema),
  judgments: z.array(JudgmentSchema),
  /** Free-form pointers (s3://, file://, https://) to bundled artifacts. */
  artifacts: z.record(z.string().min(1), z.string().min(1)).default({}),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;
