/**
 * Systematic thermal gradient sweep: compare lowLatency mitigations while charging/cooling.
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api preview:thermal
 *   LABOS_THERMAL_DURATION_SEC=180 LABOS_THERMAL_INTERVAL_MS=2000 pnpm preview:thermal
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PREVIEW_PROFILES, PreviewProtocolConfigSchema, type PreviewProtocolConfig } from "@openlabos/preview";
import { adb, setTargetDevice } from "../adb.js";
import { restartPreviewWithConfig } from "../preview/preview-stream-gate.js";
import { analyzeThermalGradient, rankThermalMitigations } from "../power/thermal-gradient.js";
import { runSynchronizedTrace } from "../power/power-trace.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const DURATION_SEC = Number(process.env.LABOS_THERMAL_DURATION_SEC || 180);
const INTERVAL_MS = Number(process.env.LABOS_THERMAL_INTERVAL_MS || 2000);
const THRESHOLD_C = Number(process.env.LABOS_THERMAL_THRESHOLD_C || 75);
const COOLDOWN_BETWEEN_SEC = Number(process.env.LABOS_THERMAL_COOLDOWN_SEC || 30);

/** Thermal mitigation lattice derived from lowLatency baseline. */
const THERMAL_CANDIDATES: Array<{ id: string; config: PreviewProtocolConfig | null; note: string }> = [
  { id: "lowLatencySustained", config: PREVIEW_PROFILES.lowLatencySustained.config, note: "Default 720p24 — thermal-safe sustained" },
  { id: "lowLatency", config: PREVIEW_PROFILES.lowLatency.config, note: "Burst 720p30 — lab only" },
  {
    id: "lowLatency-24fps",
    config: PreviewProtocolConfigSchema.parse({ ...PREVIEW_PROFILES.lowLatency.config, fps: 24 }),
    note: "Reduce pixel rate 20%",
  },
  {
    id: "lowLatency-20fps",
    config: PreviewProtocolConfigSchema.parse({ ...PREVIEW_PROFILES.lowLatency.config, fps: 20 }),
    note: "Reduce pixel rate 33%",
  },
  {
    id: "lowLatency-1.5mbps",
    config: PreviewProtocolConfigSchema.parse({ ...PREVIEW_PROFILES.lowLatency.config, h264Bitrate: 1_500_000 }),
    note: "Lower entropy / Wi‑Fi airtime",
  },
  {
    id: "h264Fast",
    config: PREVIEW_PROFILES.h264Fast.config,
    note: "854×480 @ 30fps — fewer sensor pixels",
  },
  {
    id: "h264Compact",
    config: PREVIEW_PROFILES.h264Compact.config,
    note: "640×360 @ 30fps — minimum H.264 pixels",
  },
  { id: "idle", config: null, note: "Preview off — soak/charge thermal baseline" },
];

function log(msg: string, data?: unknown) {
  console.log(`[thermal-sweep] ${msg}`, data !== undefined ? JSON.stringify(data) : "");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureForwards() {
  await adb(["connect", SERIAL], 15_000);
  setTargetDevice(SERIAL);
  await adb(["forward", `tcp:${PREVIEW_PORT}`, "tcp:8089"], 10_000);
}

function previewPut(config: PreviewProtocolConfig) {
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

async function readBatteryCharging(): Promise<boolean | null> {
  const out = await adb(["shell", "dumpsys", "battery"], 5000).catch(() => "");
  const ac = /AC powered:\s*true/.test(out);
  const usb = /USB powered:\s*true/.test(out);
  const wireless = /Wireless powered:\s*true/.test(out);
  if (ac || usb || wireless) return true;
  const status = out.match(/status:\s*(\d+)/)?.[1];
  if (status === "2" || status === "5") return true;
  if (status === "3") return false;
  return null;
}

async function measureThermal(id: string, config: PreviewProtocolConfig | null, outDir: string) {
  log("candidate", { id, note: THERMAL_CANDIDATES.find((c) => c.id === id)?.note });
  let stopStream: (() => void) | null = null;
  let streamGate = null;

  if (config) {
    streamGate = await restartPreviewWithConfig(PREVIEW_PORT, config, cameraBroadcast, previewPut);
    if (!streamGate.ok) {
      return {
        id,
        skipped: true,
        skipReason: `stream gate failed: ${streamGate.lastError}`,
        streamGate,
        config,
      };
    }
    const streamPath = config.transport === "h264-annexb-http" ? "/stream/avc" : "/stream";
    stopStream = await bootStream(streamPath);
    await sleep(5000);
  } else {
    await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
    await sleep(2000);
  }

  const jsonlPath = path.join(outDir, `${id}.jsonl`);
  const { samples, summary } = await runSynchronizedTrace({
    label: id,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    previewPort: PREVIEW_PORT,
    cpuEveryNTicks: 1,
    outPath: jsonlPath,
  });
  stopStream?.();

  const thermal = analyzeThermalGradient(samples, THRESHOLD_C);
  return {
    id,
    skipped: false,
    config,
    streamGate,
    traceJsonl: jsonlPath,
    timeSeriesSummary: summary,
    thermal,
    note: THERMAL_CANDIDATES.find((c) => c.id === id)?.note,
  };
}

async function main() {
  const filter = (process.env.LABOS_THERMAL_CANDIDATES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const candidates = THERMAL_CANDIDATES.filter((c) => !filter.length || filter.includes(c.id));
  const outDir = path.resolve(process.cwd(), "artifacts", "preview-thermal", `run-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  await ensureForwards();
  const charging = await readBatteryCharging();
  log("start", { device: DEVICE_IP, charging, durationSec: DURATION_SEC, intervalMs: INTERVAL_MS, thresholdC: THRESHOLD_C, outDir });

  const results = [];
  for (const candidate of candidates) {
    results.push(await measureThermal(candidate.id, candidate.config, outDir));
    if (COOLDOWN_BETWEEN_SEC > 0) {
      await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW").catch(() => null);
      log("cooldown", { sec: COOLDOWN_BETWEEN_SEC });
      await sleep(COOLDOWN_BETWEEN_SEC * 1000);
    }
  }

  const valid = results.filter((r) => !r.skipped && r.thermal) as Array<(typeof results)[number] & { thermal: NonNullable<typeof results[number]["thermal"]> }>;
  const ranked = rankThermalMitigations(valid.map((r) => ({ id: r.id, thermal: r.thermal! })));

  const report = {
    generatedAtMs: Date.now(),
    deviceIp: DEVICE_IP,
    charging,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    thresholdC: THRESHOLD_C,
    outDir,
    methodology:
      "Measure CPU/skin ramp (°C/min) vs instantaneous mW, fps, Wi‑Fi TX. Lower ramp + lower max = better thermal headroom.",
    results: results.map((r) => ({
      id: r.id,
      skipped: r.skipped,
      skipReason: r.skipReason ?? null,
      note: r.note,
      streamGate: r.streamGate ?? null,
      traceJsonl: r.traceJsonl ?? null,
      thermal: r.thermal ?? null,
      timeSeriesSummary: r.timeSeriesSummary ?? null,
    })),
    ranking: ranked.map((r) => ({
      id: r.id,
      rampCPerMin: r.thermal.cpuC.rampRateCPerMin,
      maxCpuC: r.thermal.cpuC.max,
      secondsToThreshold: r.thermal.cpuC.secondsToThreshold,
      thermalStressScore: r.thermal.thermalStressScore,
      correlations: r.thermal.correlations,
    })),
    recommendation: ranked[0] ?? null,
  };

  const outFile = path.join(outDir, "report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  log("ranking", report.ranking);
  log("done", { outFile });
}

main().catch((error) => {
  console.error("[thermal-sweep] failed", error);
  process.exit(1);
});
