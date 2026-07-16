import { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function adaptersRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get("/", (c) => c.json({ adapters: deps.adapters.list() }));
  return app;
}
