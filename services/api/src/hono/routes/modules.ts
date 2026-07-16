import { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function modulesRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get("/", (c) =>
    c.json({
      modules: deps.modules.list().map((m) => ({
        id: m.id,
        version: m.version,
        description: m.description,
        criterion_kinds: (m.criteria ?? []).map((k) => k.kind),
      })),
    }),
  );
  return app;
}
