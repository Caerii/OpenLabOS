/**
 * Hono entry point. Brings up the new coordination surface with in-memory
 * stores by default; later passes wire SQLite + filesystem repositories.
 *
 * If `OPENLABOS_DEVICE_BASE_URL` is set, an `AndroidDeviceAdapter` is
 * registered at boot so the API has a real device to route to. Token is
 * read from `OPENLABOS_DEVICE_TOKEN` when present (the on-device server
 * may require it for protected routes).
 */
import { serve } from "@hono/node-server";
import { AndroidDeviceAdapter } from "@openlabos/device-android";
import { AdapterRegistry } from "../core/adapters/registry.js";
import type { DeviceAdapter } from "../core/adapters/types.js";
import { ModuleRegistry } from "../core/modules/registry.js";
import { InMemorySessionStore } from "../core/sessions/store.js";
import { createApp } from "./app.js";

const port = Number(process.env.OPENLABOS_API_PORT ?? 3847);
const host = process.env.OPENLABOS_API_HOST ?? "0.0.0.0";

const sessions = new InMemorySessionStore();
const adapters = new AdapterRegistry();
const modules = new ModuleRegistry();

async function registerEnvAdapters(): Promise<void> {
  const baseUrl = process.env.OPENLABOS_DEVICE_BASE_URL;
  if (!baseUrl) return;
  const token = process.env.OPENLABOS_DEVICE_TOKEN;
  const adapter = new AndroidDeviceAdapter({ baseUrl, token });
  // The adapter package's DeviceAdapter shape is a structural mirror of the
  // API's local DeviceAdapter type. Cast at the seam, document why in
  // decision 0017 (adapter contract package) when we extract the shared
  // contract.
  await adapters.register(adapter as unknown as DeviceAdapter);
  console.log(`[openlabos/api] registered android adapter for ${baseUrl}`);
}

await registerEnvAdapters();

const app = createApp({ sessions, adapters, modules });

serve({ fetch: app.fetch, port, hostname: host }, ({ address, port }) => {
  // eslint-disable-next-line no-console
  console.log(`[openlabos/api] hono listening on http://${address}:${port}`);
});
