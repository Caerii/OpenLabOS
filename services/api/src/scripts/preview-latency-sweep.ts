/**
 * Empirical preview latency sweep: applies profiles, warms stream, samples
 * per-stage pipeline metrics from device + local stream tap, writes JSON report.
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api exec tsx src/scripts/preview-latency-sweep.ts
 *   LABOS_SWEEP_PROFILES=balanced,lowLatency LABOS_SWEEP_SAMPLES=30 pnpm ...
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  PREVIEW_PROFILES,
  RollingLatencyRecorder,
  getLastStreamFrameMeta,
  getStreamFrameAgeMs,
  resetPreviewStreamTapForTests,
  tapPreviewStreamChunk,
  type PreviewProfileId,
} from "@openlabos/preview";
import { adb, setTargetDevice } from "../adb.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || process.env.LABOS_GLASSES_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const HOST_API_PORT = Number(process.env.LABOS_API_PORT || 0);
const SAMPLE_COUNT = Number(process.env.LABOS_SWEEP_SAMPLES || 24);
const SAMPLE_INTERVAL_MS = Number(process.env.LABOS_SWEEP_INTERVAL_MS || 500);
const WARMUP_MS = Number(process.env.LABOS_SWEEP_WARMUP_MS || 6000);
const PROFILE_IDS = (process.env.LABOS_SWEEP_PROFILES || "balanced,lowLatency")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as PreviewProfileId[];

type Json = Record<string, unknown>;

type SweepSample = {
  atMs: number;
  streamFrameAgeMs: number | null;
  deviceMetrics: Json | null;
  hostTrace: Json | null;
  streamMeta: ReturnType<typeof getLastStreamFrameMeta>;
};

type ProfileSweep = {
  profileId: string;
  config: Json;
  warmupMs: number;
  samples: SweepSample[];
  deviceSummary: Record<string, { p50Ms: number | null; p95Ms: number | null; avgMs: number | null }>;
  hostSummary: Record<string, { p50Ms: number | null; p95Ms: number | null; avgMs: number | null }>;
};

function log(msg: string, data?: unknown) {
  console.log(`[latency-sweep] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
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
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: opts.method || "GET",
        headers: opts.headers,
        timeout: timeoutMs,
      },
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
  return { status: res.status, json: safeJson(res.body), raw: res.body };
}

async function previewPut(body: Json) {
  const payload = JSON.stringify({ ...body, instrumentMetrics: true });
  const res = await httpJson({
    hostname: "127.0.0.1",
    port: PREVIEW_PORT,
    path: "/config",
    method: "PUT",
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
    body: payload,
  });
  return { status: res.status, json: safeJson(res.body) };
}

function safeJson(body: string): Json | null {
  try {
    return JSON.parse(body) as Json;
  } catch {
    return null;
  }
}

async function cameraBroadcast(action: string) {
  await adb(
    ["shell", "am", "broadcast", "-a", action, "-n", "com.openlab.labos.camera/.CameraCommandReceiver"],
    10_000,
  );
}

async function bootStreamForPath(path: string, onData?: (chunk: Buffer) => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PREVIEW_PORT, path, method: "GET" },
      (res) => {
        if ((res.statusCode || 0) >= 400) {
          res.resume();
          reject(new Error(`stream HTTP ${res.statusCode}`));
          return;
        }
        res.on("data", (chunk: Buffer) => onData?.(chunk));
        resolve(() => req.destroy());
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function summarizeDevice(samples: SweepSample[]) {
  const byStage = new Map<string, number[]>();
  for (const sample of samples) {
    const stages = sample.deviceMetrics?.stages;
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
  const summary: ProfileSweep["deviceSummary"] = {};
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

function summarizeHost(recorder: RollingLatencyRecorder) {
  const snapshot = recorder.snapshot();
  const summary: ProfileSweep["hostSummary"] = {};
  for (const row of snapshot.stages) {
    summary[row.stage] = { p50Ms: row.p50Ms, p95Ms: row.p95Ms, avgMs: row.avgMs };
  }
  return summary;
}

async function fetchHostTrace(): Promise<Json | null> {
  if (!HOST_API_PORT) return null;
  try {
    const res = await httpJson({ hostname: "127.0.0.1", port: HOST_API_PORT, path: "/api/preview/trace" });
    if (res.status !== 200) return null;
    return JSON.parse(res.body) as Json;
  } catch {
    return null;
  }
}

async function sweepProfile(profileId: PreviewProfileId): Promise<ProfileSweep> {
  if (!(profileId in PREVIEW_PROFILES)) {
    throw new Error(`unknown profile: ${profileId}`);
  }
  const profile = PREVIEW_PROFILES[profileId];
  log("profile", { profileId, transport: profile.config.transport });

  resetPreviewStreamTapForTests();
  const hostRecorder = new RollingLatencyRecorder(300);

  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
  await sleep(800);
  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
  await sleep(2000);

  await previewPut(profile.config as unknown as Json);

  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
  await sleep(800);
  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
  await sleep(2500);

  const streamPath = profile.config.transport === "h264-annexb-http" ? "/stream/avc" : "/stream";

  const stopStream = await bootStreamForPath(streamPath, (chunk) => {
    tapPreviewStreamChunk(chunk);
    hostRecorder.recordTrace({
      recordedAtMs: Date.now(),
      deviceFrameAgeMs: getStreamFrameAgeMs(),
      ...getLastStreamFrameMeta(),
    });
  });
  await sleep(WARMUP_MS);

  const samples: SweepSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const metrics = await previewGet("/metrics");
    samples.push({
      atMs: Date.now(),
      streamFrameAgeMs: getStreamFrameAgeMs(),
      deviceMetrics: metrics.json,
      hostTrace: await fetchHostTrace(),
      streamMeta: getLastStreamFrameMeta(),
    });
    await sleep(SAMPLE_INTERVAL_MS);
  }
  stopStream();

  return {
    profileId,
    config: profile.config as unknown as Json,
    warmupMs: WARMUP_MS,
    samples,
    deviceSummary: summarizeDevice(samples),
    hostSummary: summarizeHost(hostRecorder),
  };
}

async function main() {
  log("start", { device: DEVICE_IP, profiles: PROFILE_IDS, samples: SAMPLE_COUNT, hostApiPort: HOST_API_PORT || null });
  await ensureForwards();

  const results: ProfileSweep[] = [];
  for (const profileId of PROFILE_IDS) {
    results.push(await sweepProfile(profileId));
  }

  const report = {
    generatedAtMs: Date.now(),
    deviceIp: DEVICE_IP,
    sampleCount: SAMPLE_COUNT,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    profiles: results,
  };

  const outDir = path.resolve(process.cwd(), "artifacts", "preview-sweeps");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `sweep-${DEVICE_IP.replace(/\./g, "-")}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  log("done", { outFile });
  for (const row of results) {
    log(`device:${row.profileId}`, row.deviceSummary);
    log(`host:${row.profileId}`, row.hostSummary);
  }
}

main().catch((error) => {
  console.error("[latency-sweep] failed", error);
  process.exit(1);
});
