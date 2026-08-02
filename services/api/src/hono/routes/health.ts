import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { probeJson } from "../../util/fetch-resilience.js";

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

  app.get("/readyz", async (c) => {
    const inferenceUrl = (
      process.env.OPENLABOS_INFERENCE_URL ?? "http://localhost:8001"
    ).replace(/\/$/, "");
    const segmentationMode = (
      process.env.LABOS_ENTITY_SEGMENTATION_MODE ?? "off"
    ).toLowerCase();
    const sidecarUrl = (
      process.env.LABOS_SEGMENTATION_SIDECAR_URL ?? ""
    ).replace(/\/$/, "");

    const inference = await probeJson(
      `${inferenceUrl}/v1/healthz`,
      (b): b is { ok: boolean } =>
        typeof b === "object" && b !== null && (b as { ok?: boolean }).ok === true,
    );

    let perception: { ok: boolean; detail?: string } = { ok: true };
    if (segmentationMode === "sidecar" && sidecarUrl) {
      const token = process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN?.trim();
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      try {
        const res = await fetch(`${sidecarUrl}/health`, {
          headers,
          signal: AbortSignal.timeout(2_000),
        });
        const body = await res.json();
        perception = {
          ok: res.ok && typeof body === "object" && body !== null && (body as { ok?: boolean }).ok === true,
          detail: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (err) {
        perception = {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const ready = inference.ok && perception.ok;
    return c.json(
      {
        ready,
        checks: {
          inference: { ok: inference.ok, detail: inference.ok ? undefined : inference.detail },
          perception: { ok: perception.ok, detail: perception.detail },
        },
      },
      ready ? 200 : 503,
    );
  });

  return app;
}
