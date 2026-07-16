/**
 * Empirical energy calibration sweep with synchronized temporal jsonl traces.
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api preview:energy
 *   LABOS_ENERGY_INTERVAL_MS=1000 LABOS_ENERGY_DURATION_SEC=120 pnpm preview:energy
 *   LABOS_ENERGY_WAIT_COULOMB=1  — gate on µAh counter movement before sweep
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  PREVIEW_PROFILES,
  bestEnergyAtLatency,
  energyEfficiencyScore,
  energyQualityPareto,
  estimatePreviewEnergyMw,
  fitEnergyCoefficients,
  inferMeasuredPowerMw,
  resolveParetoCandidates,
  type PreviewProtocolConfig,
  type PreviewProfileId,
} from "@openlabos/preview";
import { describeBatteryGranularity } from "../power/battery-granularity.js";
import { analyzeThermalGradient } from "../power/thermal-gradient.js";
import { restartPreviewWithConfig } from "../preview/preview-stream-gate.js";
import {
  runSynchronizedTrace,
  waitForCoulombMovement,
} from "../power/power-trace.js";
import { inferMeasuredPowerMw, type PowerSample } from "../power/power-profiler.js";
import { adb, setTargetDevice } from "../adb.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || process.env.LABOS_GLASSES_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const DURATION_SEC = Number(process.env.LABOS_ENERGY_DURATION_SEC || 90);
const INTERVAL_MS = Number(process.env.LABOS_ENERGY_INTERVAL_MS || Number(process.env.LABOS_ENERGY_INTERVAL_SEC || 2) * 1000);
const WARMUP_MS = Number(process.env.LABOS_ENERGY_WARMUP_MS || 8000);
const WAIT_COULOMB = process.env.LABOS_ENERGY_WAIT_COULOMB === "1" || process.argv.includes("--wait-coulomb");
const DEEP = process.env.LABOS_ENERGY_DEEP === "1" || process.argv.includes("--deep");
const CANDIDATE_FILTER = (process.env.LABOS_ENERGY_CANDIDATES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Json = Record<string, unknown>;

function log(msg: string, data?: unknown) {
  console.log(`[energy-sweep] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
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

async function cameraBroadcast(action: string) {
  await adb(["shell", "am", "broadcast", "-a", action, "-n", "com.openlab.labos.camera/.CameraCommandReceiver"], 10_000);
}

function traceToLegacyPowerSamples(traceSamples: Awaited<ReturnType<typeof runSynchronizedTrace>>["samples"]): PowerSample[] {
  return traceSamples.map((s) => ({
    at: s.at,
    atMs: s.atMs,
    battery: {
      level: s.battery.levelPercent,
      voltageMv: s.battery.voltageMv,
      temperatureC: s.battery.temperatureC,
      chargeCounterUah: s.battery.chargeCounterUah,
      status: s.battery.status,
      currentNowRaw: s.battery.currentNowRaw,
      currentAvgRaw: s.battery.currentAvgRaw,
    },
    cpu: s.cpu ?? {
      load: null,
      totalPercent: null,
      labosCorePercent: null,
      labosCameraPercent: null,
      dashboardPercent: null,
      adbdPercent: null,
    },
    thermal: s.thermal ?? { cpuC: null, gpuC: null, batteryC: null, skinC: null },
    wifi: { rxBytes: s.wifi.rxBytes, txBytes: s.wifi.txBytes },
    preview: s.pipeline
      ? {
          ok: true,
          streaming: true,
          recording: false,
          frameCount: s.pipeline.frameCount ?? 0,
          fps: s.pipeline.fps ?? 0,
          frameBytes: s.pipeline.frameBytes ?? 0,
        }
      : null,
  }));
}

function resolveCandidates() {
  if (CANDIDATE_FILTER.length) {
    return CANDIDATE_FILTER.map((id) => {
      if (id in PREVIEW_PROFILES) {
        return { id, config: PREVIEW_PROFILES[id as PreviewProfileId].config };
      }
      const fromGrid = resolveParetoCandidates(DEEP).find((c) => c.id === id);
      if (!fromGrid) throw new Error(`unknown candidate ${id}`);
      return fromGrid;
    });
  }
  const profileIds: PreviewProfileId[] = ["lowLatencySustained", "lowLatency", "h264Compact", "h264Fast", "fastMjpeg"];
  return profileIds.map((id) => ({ id, config: PREVIEW_PROFILES[id].config }));
}

async function measureCandidate(id: string, config: PreviewProtocolConfig, outDir: string) {
  log("candidate", { id, encodeMode: config.encodeMode, width: config.width, height: config.height, fps: config.fps });

  const streamGate = await restartPreviewWithConfig(PREVIEW_PORT, config, cameraBroadcast, previewPut);
  if (!streamGate.ok) {
    log("skip", { id, reason: streamGate.lastError, gate: streamGate });
    return {
      id,
      config,
      skipped: true,
      skipReason: `stream gate: ${streamGate.lastError}`,
      streamGate,
      measuredMw: null,
      measurementMethod: "unavailable" as const,
      chargeDeltaUah: null,
      modeledMw: null,
      modelErrorMw: null,
      modeledBreakdown: null,
      observedFps: null,
      frameBytes: null,
      latencyMs: NaN,
      qualityScore: 0,
      energyEfficiency: null,
      samples: 0,
      durationSec: 0,
      intervalMs: INTERVAL_MS,
      traceJsonl: null,
      traceSummaryPath: null,
      timeSeries: null,
      thermal: null,
      batteryGranularity: null,
    };
  }
  log("stream-ready", streamGate);

  const streamPath = config.transport === "h264-annexb-http" ? "/stream/avc" : "/stream";
  const stopStream = await bootStream(streamPath);
  await sleep(Math.min(WARMUP_MS, 5000));

  const jsonlPath = path.join(outDir, `${id}.jsonl`);
  const { samples: traceSamples, summary: timeSeries } = await runSynchronizedTrace({
    label: id,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    previewPort: PREVIEW_PORT,
    cpuEveryNTicks: Math.max(1, Math.round(5000 / INTERVAL_MS)),
    outPath: jsonlPath,
  });
  stopStream();

  const legacySamples = traceToLegacyPowerSamples(traceSamples);
  const power = inferMeasuredPowerMw(legacySamples);
  const measuredMw = power.mw ?? timeSeries.soc.coulombAvgMw ?? timeSeries.powerMw.instantaneous.avg;
  const measurementMethod =
    power.method !== "unavailable"
      ? power.method
      : timeSeries.soc.coulombAvgMw !== null
        ? "charge-counter"
        : timeSeries.powerMw.instantaneous.avg !== null
          ? "sysfs-current"
          : "unavailable";

  const observedFps = timeSeries.pipeline.fps.avg ?? config.fps;
  const frameBytes = avg(traceSamples.map((s) => s.pipeline?.frameBytes ?? null));
  const latencyMs =
    timeSeries.pipeline.glassToGlassMs.p50 ??
    timeSeries.pipeline.streamFrameAgeMs.p50 ??
    NaN;
  const qualityScore = (config.width * config.height * (observedFps ?? config.fps)) / 1_000_000;

  const ctx = {
    fps: observedFps,
    frameBytes,
    cpuCameraPercent: timeSeries.cpu.cameraAvg,
    cpuTotalPercent: timeSeries.cpu.totalAvg,
    wifiTxBytesPerSec: timeSeries.wifi.txBytesPerSecAvg,
    thermalCpuC: timeSeries.thermal.cpuMaxC,
    batteryVoltageMv: traceSamples[0]?.battery.voltageMv ?? null,
  };
  const modeled = estimatePreviewEnergyMw(config, ctx);
  const thermal = analyzeThermalGradient(traceSamples, 75);

  const first = traceSamples[0];
  const last = traceSamples.at(-1);

  return {
    id,
    config,
    skipped: false,
    streamGate,
    measuredMw,
    measurementMethod,
    chargeDeltaUah: timeSeries.soc.chargeDeltaUah,
    modeledMw: modeled.totalMw,
    modelErrorMw: measuredMw !== null ? Math.round((modeled.totalMw - measuredMw) * 10) / 10 : null,
    modeledBreakdown: modeled.subsystems,
    observedFps,
    frameBytes,
    latencyMs,
    qualityScore: Math.round(qualityScore * 10) / 10,
    energyEfficiency: measuredMw ? energyEfficiencyScore(qualityScore, measuredMw) : null,
    samples: traceSamples.length,
    durationSec: timeSeries.durationSec,
    intervalMs: INTERVAL_MS,
    traceJsonl: jsonlPath,
    traceSummaryPath: jsonlPath.replace(/\.jsonl$/, ".summary.json"),
    timeSeries,
    thermal,
    batteryGranularity: {
      start: describeBatteryGranularity({
        levelPercent: first?.battery.levelPercent ?? null,
        socFractionalPercent: first?.battery.socFractionalPercent ?? null,
        chargeCounterUah: first?.battery.chargeCounterUah ?? null,
        chargeFullUah: first?.battery.chargeFullUah ?? null,
      }),
      end: describeBatteryGranularity({
        levelPercent: last?.battery.levelPercent ?? null,
        socFractionalPercent: last?.battery.socFractionalPercent ?? null,
        chargeCounterUah: last?.battery.chargeCounterUah ?? null,
        chargeFullUah: last?.battery.chargeFullUah ?? null,
      }),
    },
  };
}

function avg(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => Number.isFinite(Number(v)));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

async function main() {
  const candidates = resolveCandidates();
  const outDir = path.resolve(process.cwd(), "artifacts", "preview-energy", `run-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  log("start", {
    device: DEVICE_IP,
    candidates: candidates.map((c) => c.id),
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    outDir,
  });
  await ensureForwards();

  if (WAIT_COULOMB) {
    log("wait-coulomb", { timeoutSec: 120 });
    const gate = await waitForCoulombMovement({ timeoutSec: 120, pollMs: 3000, previewPort: PREVIEW_PORT });
    log("coulomb-gate", gate);
  }

  const results = [];
  for (const candidate of candidates) {
    const row = await measureCandidate(candidate.id, candidate.config, outDir);
    log("measured", {
      id: row.id,
      measuredMw: row.measuredMw,
      method: row.measurementMethod,
      coulombSoc: row.timeSeries.soc.socFractionalEnd,
      syncSkewP95Ms: row.timeSeries.syncSkewMs.p95,
      latencyP50Ms: row.timeSeries.pipeline.glassToGlassMs.p50 ?? row.timeSeries.pipeline.streamFrameAgeMs.p50,
      traceJsonl: row.traceJsonl,
    });
    results.push(row);
  }

  const calibrated = results.filter((r) => !r.skipped && r.measuredMw !== null) as Array<(typeof results)[number] & { measuredMw: number }>;
  const fittedCoeffs = fitEnergyCoefficients(
    calibrated.map((r) => ({
      config: r.config,
      measuredMw: r.measuredMw,
      context: { fps: r.observedFps, frameBytes: r.frameBytes, thermalCpuC: r.timeSeries.thermal.cpuMaxC },
    })),
  );

  const refitted = results.map((r) => {
    if (r.skipped || r.measuredMw === null) return { ...r, refittedMw: null, refitErrorMw: null };
    const breakdown = estimatePreviewEnergyMw(r.config, { fps: r.observedFps, frameBytes: r.frameBytes }, fittedCoeffs);
    return { ...r, refittedMw: breakdown.totalMw, refitErrorMw: Math.round((breakdown.totalMw - r.measuredMw) * 10) / 10 };
  });

  const energyPoints = refitted
    .filter((r) => !r.skipped && r.measuredMw !== null && Number.isFinite(r.latencyMs))
    .map((r) => ({
      id: r.id,
      latencyMs: r.latencyMs,
      qualityScore: r.qualityScore,
      totalMw: r.measuredMw!,
      energyEfficiency: r.energyEfficiency ?? 0,
    }));

  const report = {
    generatedAtMs: Date.now(),
    deviceIp: DEVICE_IP,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    outDir,
    batteryGranularityNote:
      "UI level% is integer (voice may round to 10%). Use socFractionalPercent + charge_counter µAh deltas for sub-percent temporal resolution.",
    fittedCoefficients: fittedCoeffs,
    results: refitted.map(({ config, timeSeries, thermal, ...rest }) => ({
      ...rest,
      encodeMode: config.encodeMode,
      width: config.width,
      height: config.height,
      fps: config.fps,
      timeSeriesSummary: timeSeries,
      thermalAnalysis: thermal,
    })),
    energyFrontier: energyQualityPareto(energyPoints),
    recommendations: {
      lowestPowerUnder50ms: bestEnergyAtLatency(energyPoints, 50),
      lowestPowerUnder100ms: bestEnergyAtLatency(energyPoints, 100),
    },
  };

  const outFile = path.join(outDir, "report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  log("recommendations", report.recommendations);
  log("done", { outFile, traceDir: outDir });
}

main().catch((error) => {
  console.error("[energy-sweep] failed", error);
  process.exit(1);
});
