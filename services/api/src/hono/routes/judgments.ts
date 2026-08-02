/**
 * Coordination plane → reasoning plane bridge.
 *
 * The API forwards judgment requests to `services/inference` at
 * `OPENLABOS_INFERENCE_URL` (default http://localhost:8001). The API
 * never imports a vendor SDK; this handler only knows the documented
 * contract documented in decision 0005.
 *
 * On a successful judgment, the API also persists a `judgment_emitted`
 * event onto the session log so the folded view counts it.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { fetchWithResilience } from "../../util/fetch-resilience.js";
import type { AppDeps } from "../app.js";

const ForwardBody = z.object({
  session_id: z.string().uuid(),
  step: z.object({
    step_id: z.string().min(1),
    title: z.string().min(1),
    instruction: z.string().min(1),
    expected_objects: z.array(z.record(z.string(), z.unknown())).default([]),
    success_criteria: z
      .array(
        z.object({
          kind: z.string().min(1),
          description: z.string().default(""),
        }),
      )
      .default([]),
  }),
  frame_uri: z.string().optional(),
  frame_b64: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  provider: z.string().optional(),
});

export function judgmentsRoutes(deps: AppDeps) {
  const app = new Hono();
  const inferenceUrl = (
    process.env.OPENLABOS_INFERENCE_URL ?? "http://localhost:8001"
  ).replace(/\/$/, "");

  app.post("/", zValidator("json", ForwardBody), async (c) => {
    const body = c.req.valid("json");
    let res: Response;
    try {
      res = await fetchWithResilience(`${inferenceUrl}/v1/judgments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return c.json(
        {
          error: "inference unreachable",
          detail: err instanceof Error ? err.message : String(err),
        },
        502,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      return c.json(
        { error: "inference upstream", detail: text },
        res.status as 400 | 500 | 502 | 503,
      );
    }
    const judgment = JSON.parse(text) as {
      judgment_id: string;
      session_id: string;
      step_id: string;
      [k: string]: unknown;
    };

    // Append a judgment_emitted event so the folded view counts it.
    try {
      await deps.sessions.appendEvent(judgment.session_id, {
        kind: "judgment_emitted",
        at: new Date().toISOString(),
        step_id: judgment.step_id,
        judgment_id: judgment.judgment_id,
      });
    } catch {
      // Session may already be finalized; surfacing the judgment is the
      // primary contract here. Skip the bookkeeping rather than fail.
    }

    return c.json(judgment, 200);
  });

  return app;
}
