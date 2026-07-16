import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SessionEventSchema } from "@openlabos/protocol";
import { z } from "zod";
import type { AppDeps } from "../app.js";

const StartBody = z.object({
  protocol_id: z.string().min(1),
  protocol_version: z.string().min(1),
  device_adapter_id: z.string().min(1),
  operator_id: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
});

const FinalizeBody = z.object({
  status: z.enum(["completed", "abandoned", "errored"]),
});

const SessionParam = z.object({ session_id: z.string().uuid() });

export function sessionsRoutes(deps: AppDeps) {
  const app = new Hono();

  app.post("/", zValidator("json", StartBody), async (c) => {
    const body = c.req.valid("json");
    const session = await deps.sessions.startSession({
      protocolId: body.protocol_id,
      protocolVersion: body.protocol_version,
      deviceAdapterId: body.device_adapter_id,
      operatorId: body.operator_id,
      tags: body.tags,
    });
    return c.json(session, 201);
  });

  app.post(
    "/:session_id/events",
    zValidator("param", SessionParam),
    zValidator("json", SessionEventSchema),
    async (c) => {
      const { session_id } = c.req.valid("param");
      const event = c.req.valid("json");
      try {
        await deps.sessions.appendEvent(session_id, event);
        return c.json({ accepted: true as const }, 202);
      } catch {
        return c.json({ error: `Unknown session: ${session_id}` }, 404);
      }
    },
  );

  app.post(
    "/:session_id/finalize",
    zValidator("param", SessionParam),
    zValidator("json", FinalizeBody),
    async (c) => {
      const { session_id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const session = await deps.sessions.finalize(session_id, status);
      return c.json(session, 200);
    },
  );

  app.get(
    "/:session_id",
    zValidator("param", SessionParam),
    async (c) => {
      const { session_id } = c.req.valid("param");
      const view = await deps.sessions.getView(session_id);
      if (!view) return c.json({ error: "Unknown session" }, 404);
      return c.json(view, 200);
    },
  );

  app.get("/", async (c) => c.json({ sessions: await deps.sessions.list() }));

  return app;
}
