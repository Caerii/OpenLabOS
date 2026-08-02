import { describe, expect, it } from "vitest";
import { createApp } from "../../src/hono/app.js";
import { InMemorySessionStore } from "../../src/core/sessions/store.js";
import { AdapterRegistry } from "../../src/core/adapters/registry.js";
import { ModuleRegistry } from "../../src/core/modules/registry.js";

describe("/api/readyz", () => {
  it("reports not ready when inference is unreachable", async () => {
    process.env.OPENLABOS_INFERENCE_URL = "http://127.0.0.1:9";
    process.env.LABOS_ENTITY_SEGMENTATION_MODE = "off";
    const app = createApp({
      sessions: new InMemorySessionStore(),
      adapters: new AdapterRegistry(),
      modules: new ModuleRegistry(),
    });
    const res = await app.request("/api/readyz");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.checks.inference.ok).toBe(false);
  });
});
