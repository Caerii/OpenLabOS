/**
 * Mounts the Hono coordination surface on the legacy Express entry so
 * `pnpm local-agent` serves both runtimes during the Express → Hono
 * migration (decision 0016).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { getRequestListener } from "@hono/node-server";
import { AndroidDeviceAdapter } from "@openlabos/device-android";
import { AdapterRegistry } from "../core/adapters/registry.js";
import type { DeviceAdapter } from "../core/adapters/types.js";
import { ModuleRegistry } from "../core/modules/registry.js";
import { InMemorySessionStore } from "../core/sessions/store.js";
import { createApp } from "./app.js";

const HONO_EXACT_PATHS = new Set(["/api/healthz", "/api/readyz"]);

const HONO_PREFIX_PATHS = [
  "/api/sessions",
  "/api/adapters",
  "/api/modules",
  "/api/judgments",
  "/api/device/api/",
] as const;

export function shouldDelegateToHono(path: string): boolean {
  if (HONO_EXACT_PATHS.has(path)) return true;
  return HONO_PREFIX_PATHS.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

async function registerEnvAdapter(adapters: AdapterRegistry): Promise<void> {
  const baseUrl = process.env.OPENLABOS_DEVICE_BASE_URL;
  if (!baseUrl) return;

  const token = process.env.OPENLABOS_DEVICE_TOKEN;
  const adapter = new AndroidDeviceAdapter({ baseUrl, token });
  await adapters.register(adapter as unknown as DeviceAdapter);
  console.log(`[openlabos/api] registered android adapter for ${baseUrl}`);
}

export async function mountHonoOnExpress(app: Express): Promise<void> {
  const sessions = new InMemorySessionStore();
  const adapters = new AdapterRegistry();
  const modules = new ModuleRegistry();
  await registerEnvAdapter(adapters);

  const hono = createApp({ sessions, adapters, modules });
  const listener = getRequestListener(hono.fetch);

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!shouldDelegateToHono(req.path)) {
      next();
      return;
    }
    listener(req, res);
  });
}
