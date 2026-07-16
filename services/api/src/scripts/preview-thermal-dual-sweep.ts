/**
 * Dual-encode thermal matrix: preview + native recording simultaneously.
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api preview:thermal:dual
 *   LABOS_THERMAL_DUAL_DEEP=1 LABOS_TRACE_FAST_INTERVAL_MS=100 pnpm preview:thermal:dual
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { RECORD_STREAM_PROFILES, type RecordStreamProfileId } from "@openlabos/preview";
import { adb, setTargetDevice } from "../adb.js";
import { applyRecordStreamProfile } from "../preview/record-stream-profile.js";
import { restartPreviewWithConfig } from "../preview/preview-stream-gate.js";
import { analyzeThermalGradient, rankThermalMitigations } from "../power/thermal-gradient.js";
import { runSynchronizedTrace } from "../power/power-trace.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const DURATION_SEC = Number(process.env.LABOS_THERMAL_DUAL_DURATION_SEC || 300);
const INTERVAL_MS = Number(process.env.LABOS_THERMAL_DUAL_INTERVAL_MS || 2000);
const DEEP = process.env.LABOS_THERMAL_DUAL_DEEP === "1" || process.argv.includes("--deep");
const FAST_MS = Number(process.env.LABOS_TRACE_FAST_INTERVAL_MS || 100);
const FULL_MS = Number(process.env.LABOS_TRACE_FULL_INTERVAL_MS || 2000);
const THRESHOLD_C = Number(process.env.LABOS_THERMAL_THRESHOLD_C || 75);
const COOLDOWN_SEC = Number(process.env.LABOS_THERMAL_DUAL_COOLDOWN_SEC || 45);
const RECORD_WARMUP_SEC = Number(process.env.LABOS_THERMAL_DUAL_RECORD_WARMUP_SEC || 8);

const CANDIDATE_IDS = (process.env.LABOS_THERMAL_DUAL_CANDIDATES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as RecordStreamProfileId[];

const CANDIDATES = (CANDIDATE_IDS.length ? CANDIDATE_IDS : Object.keys(RECORD_STREAM_PROFILES)).map(
  (id) => RECORD_STREAM_PROFILES[id as RecordStreamProfileId],
);

function log(msg: string, data?: unknown) {
  console.log(`[thermal-dual] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureForwards() {
  await adb(["connect", SERIAL], 15_000);
  setTargetDevice(SERIAL);
  await adb(["forward", `tcp:${PREVIEW_PORT}`, "tcp:8089"], 10_000);
}

function previewPut(config: Record<string, unknown>) {
  const payload = JSON.stringify({ ...config, instrumentMetrics: true });
  return new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PREVIEW_PORT,
        path: "/config",
        method: "PUT",
        headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
      },
      (res) => {
        res.resume();
        res.on("end", () => (res.statusCode && res.statusCode < 400 ? resolve() : reject(new Error(`PUT /config ${res.statusCode}`))));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function cameraBroadcast(action: string) {
  await adb(["shell", "am", "broadcast", "-a", action, "-n", "com.openlab.labos.camera/.CameraCommandReceiver"], 10_000);
}

function bootStream(streamPath: string): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PREVIEW_PORT, path: streamPath, method: "GET" }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        res.resume();
        reject(new Error(`stream HTTP ${res.statusCode}`));
        return;
      }
      res.on("data", () => {});
      resolve(() => req.destroy());
    });
    req.on("error", reject);
    req.end();
  });
}

async function readHealth(): Promise<{ recording: boolean; streaming: boolean }> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: "127.0.0.1", port: PREVIEW_PORT, path: "/health", method: "GET", timeout: 3000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { recording?: boolean; streaming?: boolean };
          resolve({ recording: json.recording === true, streaming: json.streaming === true });
        } catch {
          resolve({ recording: false, streaming: false });
        }
      });
    });
    req.on("error", () => resolve({ recording: false, streaming: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ recording: false, streaming: false });
    });
    req.end();
  });
}

async function waitForRecording(active: boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await readHealth();
    if (h.recording === active) return h;
    await sleep(250);
  }
  return readHealth();
}

async function measureDual(profileId: RecordStreamProfileId, outDir: string) {
  const profile = RECORD_STREAM_PROFILES[profileId];
  log("candidate", { id: profileId, label: profile.label });

  await applyRecordStreamProfile(profileId, "thermal-dual");
  const streamGate = await restartPreviewWithConfig(PREVIEW_PORT, profile.config, cameraBroadcast, previewPut);
  if (!streamGate.ok) {
    return { id: profileId, skipped: true, skipReason: `stream gate failed: ${streamGate.lastError}`, streamGate };
  }

  const streamPath = profile.config.transport === "h264-annexb-http" ? "/stream/avc" : "/stream";
  const stopStream = await bootStream(streamPath);
  await sleep(5000);

  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_VIDEO");
  const recordHealth = await waitForRecording(true, 8000);
  if (!recordHealth.recording) {
    stopStream();
    await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_VIDEO").catch(() => null);
    return { id: profileId, skipped: true, skipReason: "recording did not start", streamGate, recordHealth };
  }

  log("recording-active", { warmupSec: RECORD_WARMUP_SEC });
  await sleep(RECORD_WARMUP_SEC * 1000);

  const jsonlPath = path.join(outDir, `${profileId}.jsonl`);
  const { samples, summary } = await runSynchronizedTrace({
    label: `${profileId}-dual`,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    deep: DEEP,
    fastIntervalMs: FAST_MS,
    fullIntervalMs: FULL_MS,
    previewPort: PREVIEW_PORT,
    cpuEveryNTicks: 1,
    outPath: jsonlPath,
    onSample: (s) => {
      if (s.tier === "full" && (s.tick <= 3 || s.tick % 20 === 0)) {
        log("tick", {
          tick: s.tick,
          tier: s.tier,
          mw: s.battery.instantaneousMw,
          cpuC: s.sysfsThermalCpuC ?? s.thermal?.cpuC,
          recording: s.pipeline?.recording,
          govFps: s.pipeline?.thermalGovernorCappedFps,
          fps: s.pipeline?.fps,
        });
      }
    },
  });

  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_VIDEO").catch(() => null);
  await waitForRecording(false, 5000);
  stopStream();

  const thermal = analyzeThermalGradient(samples, THRESHOLD_C);
  return {
    id: profileId,
    skipped: false,
    profile: { label: profile.label, description: profile.description, video: profile.video },
    streamGate,
    recordHealth,
    traceJsonl: jsonlPath,
    timeSeriesSummary: summary,
    thermal,
  };
}

async function main() {
  const outDir = path.resolve(process.cwd(), "artifacts", "preview-thermal-dual", `run-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  await ensureForwards();

  log("start", {
    device: DEVICE_IP,
    durationSec: DURATION_SEC,
    deep: DEEP,
    fastMs: DEEP ? FAST_MS : null,
    fullMs: DEEP ? FULL_MS : null,
    candidates: CANDIDATES.map((c) => c.label),
    outDir,
  });

  const results = [];
  for (const profile of CANDIDATES) {
    const id = Object.entries(RECORD_STREAM_PROFILES).find(([, p]) => p === profile)?.[0] as RecordStreamProfileId;
    results.push(await measureDual(id, outDir));
    await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
    await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_VIDEO").catch(() => null);
    if (COOLDOWN_SEC > 0) {
      log("cooldown", { sec: COOLDOWN_SEC });
      await sleep(COOLDOWN_SEC * 1000);
    }
  }

  const valid = results.filter((r) => !r.skipped && r.thermal) as Array<
    (typeof results)[number] & { thermal: NonNullable<(typeof results)[number]["thermal"]> }
  >;
  const ranked = rankThermalMitigations(valid.map((r) => ({ id: r.id!, thermal: r.thermal! })));

  const report = {
    generatedAtMs: Date.now(),
    deviceIp: DEVICE_IP,
    mode: "record+stream",
    durationSec: DURATION_SEC,
    deep: DEEP,
    fastIntervalMs: DEEP ? FAST_MS : null,
    fullIntervalMs: DEEP ? FULL_MS : null,
    thresholdC: THRESHOLD_C,
    outDir,
    methodology:
      "Preview-first → START_VIDEO → deep trace. Measures dual HW H.264 + sensor heat with optional 100ms sysfs spikes.",
    results,
    ranking: ranked.map((r) => ({
      id: r.id,
      rampCPerMin: r.thermal.cpuC.rampRateCPerMin,
      maxCpuC: r.thermal.cpuC.max,
      secondsToThreshold: r.thermal.cpuC.secondsToThreshold,
      thermalStressScore: r.thermal.thermalStressScore,
      powerSpikes: valid.find((v) => v.id === r.id)?.timeSeriesSummary?.spikes?.instantaneousMw.spikeCount ?? null,
    })),
    recommendation: ranked[0] ?? null,
  };

  const outFile = path.join(outDir, "report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  log("ranking", report.ranking);
  log("done", { outFile });
}

main().catch((error) => {
  console.error("[thermal-dual] failed", error);
  process.exit(1);
});
