import { z } from "zod";
import { JudgmentSchema } from "./judgment.js";
import { SessionEventSchema, SessionSchema } from "./session.js";

/**
 * A run manifest is the closure over a session: protocol id+version, every
 * event, every judgment, plus pointers to the artifacts on disk. It is the
 * thing training and eval consume and the thing reviewers audit.
 *
 * Determinism boundary: replaying `events` in order reconstructs the
 * session state exactly — that is the reproducible half of the record. The
 * `judgments` are recorded observations: re-running the producer named in
 * each judgment's `source` against the same frame does not, in general,
 * yield the same output. The manifest preserves what was judged and by
 * what, not a recomputable function.
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
