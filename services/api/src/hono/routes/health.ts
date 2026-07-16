import { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function healthRoute(deps: AppDeps) {
  const app = new Hono();
  const startedAt = Date.now();
  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      service: "@openlabos/api",
      uptime_seconds: (Date.now() - startedAt) / 1000,
      adapters: deps.adapters.list().length,
      modules: deps.modules.list().length,
    }),
  );
  app.get("/readyz", (c) => c.json({ ready: true }));
  return app;
}
