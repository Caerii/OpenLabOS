/**
 * Wait until preview stream is genuinely live after a config switch.
 * Rejects stale metrics (streamFrameAgeMs in the hundreds of seconds).
 */
import http from "node:http";
import type { PreviewProtocolConfig } from "@openlabos/preview";

export type PreviewStreamGateResult = {
  ok: boolean;
  attempts: number;
  fps: number | null;
  streamFrameAgeMs: number | null;
  frameCount: number | null;
  encodeMode: string | null;
  lastError: string | null;
};

export type PreviewStreamGateOpts = {
  port: number;
  config: PreviewProtocolConfig;
  maxAttempts?: number;
  pollMs?: number;
  /** Fresh frame age ceiling (ms). */
  maxStreamFrameAgeMs?: number;
  /** Minimum fraction of config.fps required. */
  minFpsRatio?: number;
  /** Require frameCount to increase between consecutive healthy polls. */
  requireFrameProgress?: boolean;
};

function httpGetJson(port: number, path: string, timeoutMs = 4000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET", timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function readHealth(port: number) {
  return httpGetJson(port, "/health");
}

function readMetrics(port: number) {
  return httpGetJson(port, "/metrics");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isHealthy(
  health: Record<string, unknown> | null,
  metrics: Record<string, unknown> | null,
  opts: PreviewStreamGateOpts,
  priorFrameCount: number | null,
): { healthy: boolean; reason: string; frameCount: number | null } {
  if (!health || health.ok !== true) return { healthy: false, reason: "health unreachable", frameCount: null };
  if (health.streaming !== true) return { healthy: false, reason: "not streaming", frameCount: null };

  const fps = num(health.fps);
  const streamAge = num(health.streamFrameAgeMs);
  const frameCount = num(health.frameCount) ?? num(metrics?.frameCount);
  const maxAge = opts.maxStreamFrameAgeMs ?? 2500;
  const minFps = Math.max(1, opts.config.fps * (opts.minFpsRatio ?? 0.5));

  if (streamAge === null || streamAge > maxAge) {
    return { healthy: false, reason: `stale frame age ${streamAge}ms`, frameCount };
  }
  if (fps === null || fps < minFps) {
    return { healthy: false, reason: `fps ${fps} < ${minFps}`, frameCount };
  }
  if (opts.requireFrameProgress !== false && priorFrameCount !== null && frameCount !== null) {
    if (frameCount <= priorFrameCount) {
      return { healthy: false, reason: `frameCount stalled at ${frameCount}`, frameCount };
    }
  }
  const encodeMode = typeof health.encodeMode === "string" ? health.encodeMode : null;
  if (encodeMode && encodeMode !== opts.config.encodeMode) {
    return { healthy: false, reason: `encodeMode ${encodeMode} != ${opts.config.encodeMode}`, frameCount };
  }
  return { healthy: true, reason: "ok", frameCount };
}

export async function waitForPreviewStreamReady(opts: PreviewStreamGateOpts): Promise<PreviewStreamGateResult> {
  const maxAttempts = opts.maxAttempts ?? 20;
  const pollMs = opts.pollMs ?? 1500;
  let priorFrameCount: number | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [health, metrics] = await Promise.all([readHealth(opts.port), readMetrics(opts.port)]);
    const check = isHealthy(health, metrics, opts, priorFrameCount);
    if (check.healthy) {
      return {
        ok: true,
        attempts: attempt,
        fps: num(health?.fps),
        streamFrameAgeMs: num(health?.streamFrameAgeMs),
        frameCount: check.frameCount,
        encodeMode: typeof health?.encodeMode === "string" ? health.encodeMode : null,
        lastError: null,
      };
    }
    lastError = check.reason;
    if (check.frameCount !== null) priorFrameCount = check.frameCount;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const health = await readHealth(opts.port);
  return {
    ok: false,
    attempts: maxAttempts,
    fps: num(health?.fps),
    streamFrameAgeMs: num(health?.streamFrameAgeMs),
    frameCount: num(health?.frameCount),
    encodeMode: typeof health?.encodeMode === "string" ? health.encodeMode : null,
    lastError,
  };
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function restartPreviewWithConfig(
  port: number,
  config: PreviewProtocolConfig,
  broadcast: (action: string) => Promise<void>,
  putConfig: (config: PreviewProtocolConfig) => Promise<void>,
): Promise<PreviewStreamGateResult> {
  const resolutionChanged = (prev: PreviewProtocolConfig | null, next: PreviewProtocolConfig) =>
    !prev || prev.width !== next.width || prev.height !== next.height || prev.encodeMode !== next.encodeMode;

  await putConfig(config);
  await broadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
  await sleep(config.encodeMode === "hardware-h264" ? 1500 : 800);
  await putConfig(config);
  await broadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
  await sleep(config.encodeMode === "hardware-h264" ? 4000 : 2500);

  const gate = await waitForPreviewStreamReady({
    port,
    config,
    maxAttempts: 24,
    pollMs: 1500,
    maxStreamFrameAgeMs: 2000,
    minFpsRatio: 0.45,
  });

  if (!gate.ok) {
    await broadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
    await sleep(1000);
    await broadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
    await sleep(5000);
    return waitForPreviewStreamReady({
      port,
      config,
      maxAttempts: 16,
      pollMs: 1500,
      maxStreamFrameAgeMs: 2000,
      minFpsRatio: 0.4,
    });
  }
  return gate;
}
