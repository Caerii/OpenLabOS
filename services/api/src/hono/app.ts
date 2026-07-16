/**
 * Hono application factory. Plain Hono + Zod-validator middleware. The
 * OpenAPI document is emitted by a standalone script that reads the
 * packages/protocol/schema/*.json files plus the route manifest declared
 * here — see src/hono/openapi.ts.
 */
import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { adaptersRoutes } from "./routes/adapters.js";
import { modulesRoutes } from "./routes/modules.js";
import { judgmentsRoutes } from "./routes/judgments.js";
import { deviceProxyRoutes } from "./routes/device-proxy.js";
import { type AdapterRegistry } from "../core/adapters/registry.js";
import { type ModuleRegistry } from "../core/modules/registry.js";
import { type SessionStore } from "../core/sessions/store.js";

export interface AppDeps {
  sessions: SessionStore;
  adapters: AdapterRegistry;
  modules: ModuleRegistry;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.route("/api", healthRoute(deps));
  app.route("/api/sessions", sessionsRoutes(deps));
  app.route("/api/adapters", adaptersRoutes(deps));
  app.route("/api/modules", modulesRoutes(deps));
  app.route("/api/judgments", judgmentsRoutes(deps));
  app.route("/api/device", deviceProxyRoutes());
  return app;
}
