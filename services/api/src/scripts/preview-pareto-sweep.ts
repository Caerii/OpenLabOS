/**
 * Map the preview latency/quality pareto frontier on-device.
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api preview:pareto
 *   LABOS_PARETO_DEEP=1 pnpm --filter @openlabos/api preview:pareto:deep
 *   LABOS_PARETO_CANDIDATES=mjpeg-1280x720-q42-15fps,h264-1280x720-3mbps-gop0.25-30fps
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  RollingLatencyRecorder,
  bestEnergyAtLatency,
  bestQualityAtLatency,
  energyEfficiencyScore,
  energyQualityPareto,
  estimatePreviewEnergyMw,
  getLastStreamFrameMeta,
  getStreamFrameAgeMs,
  paretoEfficiency,
  paretoFrontier,
  resetPreviewStreamTapForTests,
  resolveParetoCandidates,
  scorePreviewConfig,
  tapPreviewStreamChunk,
  type PreviewEnergyBreakdown,
  type PreviewProtocolConfig,
} from "@openlabos/preview";
import { adb, setTargetDevice } from "../adb.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || process.env.LABOS_GLASSES_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const SAMPLE_COUNT = Number(process.env.LABOS_PARETO_SAMPLES || 16);
const BURN_IN_SAMPLES = Number(process.env.LABOS_PARETO_BURN_IN || 3);
const SAMPLE_INTERVAL_MS = Number(process.env.LABOS_PARETO_INTERVAL_MS || 400);
const WARMUP_MS = Number(process.env.LABOS_PARETO_WARMUP_MS || 5000);
const DEEP =
  process.env.LABOS_PARETO_DEEP === "1" ||
  process.env.LABOS_PARETO_DEEP === "true" ||
  process.argv.includes("--deep");
const CANDIDATE_FILTER = (process.env.LABOS_PARETO_CANDIDATES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Json = Record<string, unknown>;
type StageSummary = Record<string, { p50Ms: number | null; p95Ms: number | null; avgMs: number | null }>;

type SweepResult = ReturnType<typeof scorePreviewConfig> & {
  streamFrameAgeP95Ms: number | null;
  observedFps: number | null;
  efficiency: number;
  modeledEnergyMw: number;
  energyEfficiency: number;
  energyBreakdown: PreviewEnergyBreakdown;
  deviceSummary: StageSummary;
  hostSummary: Record<string, { p50Ms: number | null; p95Ms: number | null; avgMs: number | null }>;
};

function log(msg: string, data?: unknown) {
  console.log(`[pareto-sweep] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpJson(
  opts: { hostname: string; port: number; path: string; method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = 10_000,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: opts.hostname, port: opts.port, path: opts.path, method: opts.method || "GET", headers: opts.headers, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${opts.path}`));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function ensureForwards() {
  await adb(["connect", SERIAL], 15_000);
  setTargetDevice(SERIAL);
  await adb(["forward", `tcp:${PREVIEW_PORT}`, "tcp:8089"], 10_000);
}

async function previewGet(path: string) {
  const res = await httpJson({ hostname: "127.0.0.1", port: PREVIEW_PORT, path });
  return JSON.parse(res.body) as Json;
}

async function previewPut(config: PreviewProtocolConfig) {
  const payload = JSON.stringify({ ...config, instrumentMetrics: true });
  await httpJson({
    hostname: "127.0.0.1",
    port: PREVIEW_PORT,
    path: "/config",
    method: "PUT",
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
    body: payload,
  });
}

async function cameraBroadcast(action: string) {
  await adb(["shell", "am", "broadcast", "-a", action, "-n", "com.openlab.labos.camera/.CameraCommandReceiver"], 10_000);
}

function bootStream(path: string, onData: (chunk: Buffer) => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PREVIEW_PORT, path, method: "GET" }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        res.resume();
        reject(new Error(`stream HTTP ${res.statusCode}`));
        return;
      }
      res.on("data", onData);
      resolve(() => req.destroy());
    });
    req.on("error", reject);
    req.end();
  });
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function summarizeDevice(samples: Json[]): StageSummary {
  const byStage = new Map<string, number[]>();
  for (const metrics of samples) {
    const stages = metrics.stages;
    if (!Array.isArray(stages)) continue;
    for (const row of stages) {
      if (!row || typeof row !== "object") continue;
      const stage = (row as { stage?: string }).stage;
      const lastMs = (row as { lastMs?: unknown }).lastMs;
      if (!stage || typeof lastMs !== "number") continue;
      const bucket = byStage.get(stage) || [];
      bucket.push(lastMs);
      byStage.set(stage, bucket);
    }
  }
  const summary: StageSummary = {};
  for (const [stage, values] of byStage) {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    summary[stage] = {
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      avgMs: sorted.length ? Math.round(sum / sorted.length) : null,
    };
  }
  return summary;
}

function trimBurnIn<T>(samples: T[]): T[] {
  return samples.slice(Math.min(BURN_IN_SAMPLES, Math.max(0, samples.length - 1)));
}

async function sweepCandidate(id: string, config: PreviewProtocolConfig): Promise<SweepResult> {
  log("candidate", { id, width: config.width, height: config.height, fps: config.fps, encodeMode: config.encodeMode });

  resetPreviewStreamTapForTests();
  const hostRecorder = new RollingLatencyRecorder(200);

  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
  await sleep(700);
  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
  await sleep(1800);
  await previewPut(config);
  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
  await sleep(700);
  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
  await sleep(2200);

  const streamPath = config.transport === "h264-annexb-http" ? "/stream/avc" : "/stream";
  const stopStream = await bootStream(streamPath, (chunk) => {
    if (config.transport !== "h264-annexb-http") {
      tapPreviewStreamChunk(chunk);
    }
    hostRecorder.recordTrace({
      recordedAtMs: Date.now(),
      deviceFrameAgeMs: getStreamFrameAgeMs(),
      ...getLastStreamFrameMeta(),
    });
  });
  await sleep(WARMUP_MS);

  const metricSamples: Json[] = [];
  const healthSamples: Json[] = [];
  for (let i = 0; i < SAMPLE_COUNT + BURN_IN_SAMPLES; i++) {
    metricSamples.push(await previewGet("/metrics"));
    healthSamples.push(await previewGet("/health"));
    await sleep(SAMPLE_INTERVAL_MS);
  }
  stopStream();

  const trimmedMetrics = trimBurnIn(metricSamples);
  const trimmedHealth = trimBurnIn(healthSamples);

  const deviceSummary = summarizeDevice(trimmedMetrics);
  const frameAges = trimmedHealth
    .map((h) => (typeof h.streamFrameAgeMs === "number" ? h.streamFrameAgeMs : null))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const sortedAges = [...frameAges].sort((a, b) => a - b);
  const streamFrameAgeP95 = percentile(sortedAges, 95);
  const observedFpsValues = trimmedHealth
    .map((h) => (typeof h.fps === "number" ? h.fps : null))
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const avgFps = observedFpsValues.length
    ? Math.round((observedFpsValues.reduce((a, b) => a + b, 0) / observedFpsValues.length) * 10) / 10
    : null;

  const scored = scorePreviewConfig(id, config, deviceSummary, streamFrameAgeP95, avgFps);
  const energyBreakdown = estimatePreviewEnergyMw(config, {
    fps: avgFps ?? config.fps,
    frameBytes: typeof trimmedHealth.at(-1)?.frameBytes === "number" ? Number(trimmedHealth.at(-1)?.frameBytes) : null,
  });
  const modeledEnergyMw = energyBreakdown.totalMw;

  return {
    ...scored,
    streamFrameAgeP95Ms: streamFrameAgeP95,
    observedFps: avgFps,
    efficiency: paretoEfficiency(scored.latencyMs, scored.qualityScore),
    modeledEnergyMw,
    energyEfficiency: energyEfficiencyScore(scored.qualityScore, modeledEnergyMw),
    energyBreakdown,
    deviceSummary,
    hostSummary: Object.fromEntries(
      hostRecorder.snapshot().stages.map((s) => [s.stage, { p50Ms: s.p50Ms, p95Ms: s.p95Ms, avgMs: s.avgMs }]),
    ),
  };
}

async function main() {
  const candidates = resolveParetoCandidates(DEEP).filter(
    (c) => !CANDIDATE_FILTER.length || CANDIDATE_FILTER.includes(c.id),
  );
  if (!candidates.length) throw new Error("no pareto candidates selected");

  log("start", { device: DEVICE_IP, deep: DEEP, candidates: candidates.length, samples: SAMPLE_COUNT, burnIn: BURN_IN_SAMPLES });
  await ensureForwards();

  const results: SweepResult[] = [];
  for (const candidate of candidates) {
    results.push(await sweepCandidate(candidate.id, candidate.config));
  }

  const valid = results.filter((r) => Number.isFinite(r.latencyMs));
  const frontier = paretoFrontier(valid);
  const energyPoints = valid.map((r) => ({
    id: r.id,
    latencyMs: r.latencyMs,
    qualityScore: r.qualityScore,
    totalMw: r.modeledEnergyMw,
    energyEfficiency: r.energyEfficiency,
  }));
  const energyFrontier = energyQualityPareto(energyPoints);
  const tiers = {
    at50ms: bestQualityAtLatency(valid, 50),
    at100ms: bestQualityAtLatency(valid, 100),
    at150ms: bestQualityAtLatency(valid, 150),
  };
  const energyTiers = {
    bestUnder50ms: bestEnergyAtLatency(energyPoints, 50),
    bestUnder100ms: bestEnergyAtLatency(energyPoints, 100),
  };

  const report = {
    generatedAtMs: Date.now(),
    deviceIp: DEVICE_IP,
    deep: DEEP,
    sampleCount: SAMPLE_COUNT,
    burnInSamples: BURN_IN_SAMPLES,
    candidates: results,
    frontier: frontier.map((p) => ({
      id: p.id,
      latencyMs: p.latencyMs,
      qualityScore: p.qualityScore,
      efficiency: p.efficiency,
      modeledEnergyMw: p.modeledEnergyMw,
      energyEfficiency: p.energyEfficiency,
      streamFrameAgeP95Ms: p.streamFrameAgeP95Ms,
      observedFps: p.observedFps,
      encodeMode: p.config.encodeMode,
      transport: p.config.transport,
      width: p.config.width,
      height: p.config.height,
      fps: p.config.fps,
      h264Bitrate: p.config.h264Bitrate,
      h264KeyframeIntervalSec: p.config.h264KeyframeIntervalSec,
      jpegQuality: p.config.jpegQuality,
    })),
    energyFrontier: energyFrontier.map((p) => ({
      id: p.id,
      latencyMs: p.latencyMs,
      qualityScore: p.qualityScore,
      totalMw: p.totalMw,
      energyEfficiency: p.energyEfficiency,
    })),
    tiers: {
      bestUnder50ms: tiers.at50ms ? pickSummary(tiers.at50ms) : null,
      bestUnder100ms: tiers.at100ms ? pickSummary(tiers.at100ms) : null,
      bestUnder150ms: tiers.at150ms ? pickSummary(tiers.at150ms) : null,
    },
    energyTiers: {
      lowestUnder50ms: energyTiers.bestUnder50ms,
      lowestUnder100ms: energyTiers.bestUnder100ms,
    },
  };

  const outDir = path.resolve(process.cwd(), "artifacts", "preview-pareto");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `pareto-${DEEP ? "deep-" : ""}${DEVICE_IP.replace(/\./g, "-")}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  log("tiers", report.tiers);
  log("energyTiers", report.energyTiers);
  log("frontier", report.frontier);
  log("energyFrontier", report.energyFrontier);
  log("done", { outFile });
}

function pickSummary(p: SweepResult) {
  return {
    id: p.id,
    latencyMs: p.latencyMs,
    qualityScore: p.qualityScore,
    efficiency: p.efficiency,
    modeledEnergyMw: p.modeledEnergyMw,
    energyEfficiency: p.energyEfficiency,
    observedFps: p.observedFps,
  };
}

main().catch((error) => {
  console.error("[pareto-sweep] failed", error);
  process.exit(1);
});
