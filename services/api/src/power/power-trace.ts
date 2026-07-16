/**
 * Synchronized performance + energy trace sampler.
 *
 * Battery granularity on MTK/Mentra-class devices:
 * - `dumpsys battery level` / sysfs `capacity` → integer % (often 1% sysfs, voice/UI may round to 10%)
 * - `charge_counter` / `charge_full` (µAh) → sub-percent SOC proxy (µAh resolution)
 * - `current_now` / `voltage_now` → ~1 Hz instantaneous power proxy
 *
 * Fast ticks (50–250ms): sysfs battery + sysfs thermal max — captures sub-second mW spikes.
 * Medium ticks (~1–2s): sysfs + preview /metrics + Wi‑Fi counters.
 * Slow ticks (every N): dumpsys cpuinfo + thermalservice.
 */
import fs from "node:fs";
import http from "node:http";
import { measuredPowerMwFromChargeDelta } from "@openlabos/preview";
import { analyzeTraceSpikes } from "./spike-analysis.js";
import type { SpikeAnalysis } from "./spike-analysis.js";
import {
  measuredPowerMwFromBatteryCurrent,
  parseBatteryDump,
  parseCpuInfo,
  parseThermalDump,
  type PowerSample,
} from "./power-profiler.js";
import { socFractionalPercent } from "./battery-granularity.js";
import { adbShell } from "../adb.js";

export type PipelineTraceSnapshot = {
  streamFrameAgeMs: number | null;
  fps: number | null;
  frameBytes: number | null;
  frameCount: number | null;
  frameSeq: number | null;
  captureToEncodeMs: number | null;
  encodeToPublishMs: number | null;
  deviceFrameAgeMs: number | null;
  glassToGlassMs: number | null;
  encodeMode: string | null;
  transport: string | null;
  recording: boolean | null;
  thermalGovernorCappedFps: number | null;
  thermalGovernorCpuC: number | null;
};

export type TraceSampleTier = "fast" | "full";

export type SynchronizedTraceSample = {
  tick: number;
  tier: TraceSampleTier;
  at: string;
  atMs: number;
  /** Wall-clock spread across parallel fetches this tick (lower = tighter sync). */
  syncSkewMs: number;
  battery: {
    /** Integer UI SOC from dumpsys/sysfs (often 1% steps; TTS may round coarser). */
    levelPercent: number | null;
    /** Fine-grained SOC from µAh coulomb counter: charge_counter / charge_full × 100. */
    socFractionalPercent: number | null;
    chargeCounterUah: number | null;
    chargeFullUah: number | null;
    voltageMv: number | null;
    temperatureC: number | null;
    status: number | null;
    currentNowRaw: number | null;
    currentAvgRaw: number | null;
    instantaneousMw: number | null;
    /** Rolling coulomb slope vs prior sample (null on first tick). */
    coulombSlopeMw: number | null;
    chargeDeltaUahSincePrior: number | null;
  };
  pipeline: PipelineTraceSnapshot | null;
  /** Fast sysfs thermal max (°C) — available on most ticks in deep mode. */
  sysfsThermalCpuC: number | null;
  cpu: PowerSample["cpu"] | null;
  thermal: PowerSample["thermal"] | null;
  wifi: {
    rxBytes: number | null;
    txBytes: number | null;
    rxBytesPerSec: number | null;
    txBytesPerSec: number | null;
  };
};

export type TraceSeriesSummary = {
  ticks: number;
  durationSec: number;
  syncSkewMs: { avg: number | null; p95: number | null; max: number | null };
  soc: {
    levelPercentStart: number | null;
    levelPercentEnd: number | null;
    socFractionalStart: number | null;
    socFractionalEnd: number | null;
    chargeDeltaUah: number | null;
    coulombAvgMw: number | null;
  };
  powerMw: {
    instantaneous: { avg: number | null; p50: number | null; p95: number | null; min: number | null; max: number | null };
    coulombSlope: { avg: number | null; p50: number | null; p95: number | null };
  };
  pipeline: {
    fps: { avg: number | null; p50: number | null; min: number | null };
    streamFrameAgeMs: { avg: number | null; p50: number | null; p95: number | null };
    captureToEncodeMs: { avg: number | null; p50: number | null; p95: number | null };
    encodeToPublishMs: { avg: number | null; p50: number | null; p95: number | null };
    glassToGlassMs: { avg: number | null; p50: number | null; p95: number | null };
  };
  cpu: { cameraAvg: number | null; totalAvg: number | null };
  thermal: { cpuMaxC: number | null; cpuEndC: number | null };
  wifi: { txBytesPerSecAvg: number | null; rxBytesPerSecAvg: number | null };
  spikes?: SpikeAnalysis;
};

type SysfsBatteryBatch = {
  currentNowRaw: number | null;
  currentAvgRaw: number | null;
  voltageNowRaw: number | null;
  chargeCounterUah: number | null;
  chargeFullUah: number | null;
  capacityPercent: number | null;
};

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sysfsVoltageMv(voltageNowRaw: number | null): number | null {
  if (voltageNowRaw === null || !Number.isFinite(voltageNowRaw)) return null;
  return voltageNowRaw > 10000 ? Math.round(voltageNowRaw / 1000) : voltageNowRaw;
}

function parseSysfsBatch(output: string): SysfsBatteryBatch {
  const field = (key: string) => {
    const match = output.match(new RegExp(`${key}=(-?\\d+)`));
    return match ? numberValue(match[1]) : null;
  };
  return {
    currentNowRaw: field("CN"),
    currentAvgRaw: field("CA"),
    voltageNowRaw: field("VN"),
    chargeCounterUah: field("CC"),
    chargeFullUah: field("CF"),
    capacityPercent: field("CAP"),
  };
}

async function readSysfsThermalMaxC(): Promise<number | null> {
  const output = await adbShell(
    'for z in /sys/class/thermal/thermal_zone*/temp; do [ -r "$z" ] && cat "$z"; done 2>/dev/null',
    1500,
  ).catch(() => "");
  const temps = output
    .split(/\s+/)
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!temps.length) return null;
  const maxRaw = Math.max(...temps);
  return maxRaw > 1000 ? Math.round((maxRaw / 1000) * 100) / 100 : maxRaw;
}

async function readSysfsBatteryBatch(): Promise<SysfsBatteryBatch> {
  const script = [
    "CN=$(cat /sys/class/power_supply/battery/current_now 2>/dev/null)",
    "CA=$(cat /sys/class/power_supply/battery/current_avg 2>/dev/null)",
    "VN=$(cat /sys/class/power_supply/battery/voltage_now 2>/dev/null)",
    "CC=$(cat /sys/class/power_supply/battery/charge_counter 2>/dev/null)",
    "CF=$(cat /sys/class/power_supply/battery/charge_full 2>/dev/null)",
    "CAP=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null)",
    'echo CN=$CN CA=$CA VN=$VN CC=$CC CF=$CF CAP=$CAP',
  ].join("; ");
  const output = await adbShell(script, 4000).catch(() => "");
  return parseSysfsBatch(output);
}

function readNetBytes(iface: string, direction: "rx" | "tx") {
  const stat = direction === "rx" ? "rx_bytes" : "tx_bytes";
  return adbShell(`cat /sys/class/net/${iface}/statistics/${stat}`, 2000)
    .then((value) => numberValue(value.trim()))
    .catch(() => null);
}

function previewHttpJson(
  port: number,
  path: string,
  timeoutMs = 2500,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const started = Date.now();
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
    void started;
  });
}

export function parsePipelineMetrics(json: Record<string, unknown> | null): PipelineTraceSnapshot | null {
  if (!json || json.ok !== true) return null;
  const lastTrace = (json.lastTrace as Record<string, unknown> | undefined) ?? {};
  const thermalGovernor = (json.thermalGovernor as Record<string, unknown> | undefined) ?? null;
  const frameBytes =
    typeof json.frameBytes === "number"
      ? json.frameBytes
      : typeof lastTrace.frameBytes === "number"
        ? lastTrace.frameBytes
        : null;
  return {
    streamFrameAgeMs: typeof json.streamFrameAgeMs === "number" ? json.streamFrameAgeMs : null,
    fps: typeof json.fps === "number" ? json.fps : null,
    frameBytes,
    frameCount: typeof json.frameCount === "number" ? json.frameCount : null,
    frameSeq: typeof json.frameSeq === "number" ? json.frameSeq : typeof lastTrace.frameSeq === "number" ? lastTrace.frameSeq : null,
    captureToEncodeMs:
      typeof json.lastCaptureToEncodeMs === "number"
        ? json.lastCaptureToEncodeMs
        : typeof lastTrace.captureToEncodeMs === "number"
          ? lastTrace.captureToEncodeMs
          : null,
    encodeToPublishMs:
      typeof json.lastEncodeToPublishMs === "number"
        ? json.lastEncodeToPublishMs
        : typeof lastTrace.encodeToPublishMs === "number"
          ? lastTrace.encodeToPublishMs
          : null,
    deviceFrameAgeMs:
      typeof json.avgDeviceFrameAgeMs === "number"
        ? json.avgDeviceFrameAgeMs
        : typeof lastTrace.deviceFrameAgeMs === "number"
          ? lastTrace.deviceFrameAgeMs
          : null,
    glassToGlassMs:
      typeof json.lastGlassToGlassMs === "number"
        ? json.lastGlassToGlassMs
        : typeof lastTrace.glassToGlassMs === "number"
          ? lastTrace.glassToGlassMs
          : null,
    encodeMode: typeof json.encodeMode === "string" ? json.encodeMode : null,
    transport: typeof json.transport === "string" ? json.transport : null,
    recording: typeof json.recording === "boolean" ? json.recording : null,
    thermalGovernorCappedFps:
      thermalGovernor && typeof thermalGovernor.cappedFps === "number" ? thermalGovernor.cappedFps : null,
    thermalGovernorCpuC:
      thermalGovernor && typeof thermalGovernor.cpuTempC === "number" ? thermalGovernor.cpuTempC : null,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function stats(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!valid.length) {
    return { avg: null, p50: null, p95: null, min: null, max: null };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round((sum / sorted.length) * 100) / 100,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

function avg(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function summarizeTraceSeries(samples: SynchronizedTraceSample[]): TraceSeriesSummary {
  const first = samples[0];
  const last = samples.at(-1);
  const durationSec = first && last ? Math.max(0, (last.atMs - first.atMs) / 1000) : 0;
  const chargeDeltaUah =
    first?.battery.chargeCounterUah !== null &&
    last?.battery.chargeCounterUah !== null &&
    first?.battery.chargeCounterUah !== undefined &&
    last?.battery.chargeCounterUah !== undefined
      ? last.battery.chargeCounterUah - first.battery.chargeCounterUah
      : null;

  const coulombAvgMw =
    chargeDeltaUah !== null && chargeDeltaUah < 0 && durationSec > 0 && first?.battery.voltageMv
      ? measuredPowerMwFromChargeDelta(chargeDeltaUah, durationSec, first.battery.voltageMv)
      : null;

  return {
    ticks: samples.length,
    durationSec: Math.round(durationSec * 10) / 10,
    syncSkewMs: {
      avg: avg(samples.map((s) => s.syncSkewMs)),
      p95: percentile(
        samples.map((s) => s.syncSkewMs).sort((a, b) => a - b),
        95,
      ),
      max: samples.length ? Math.max(...samples.map((s) => s.syncSkewMs)) : null,
    },
    soc: {
      levelPercentStart: first?.battery.levelPercent ?? null,
      levelPercentEnd: last?.battery.levelPercent ?? null,
      socFractionalStart: first?.battery.socFractionalPercent ?? null,
      socFractionalEnd: last?.battery.socFractionalPercent ?? null,
      chargeDeltaUah,
      coulombAvgMw,
    },
    powerMw: {
      instantaneous: stats(samples.map((s) => s.battery.instantaneousMw)),
      coulombSlope: {
        avg: avg(samples.map((s) => s.battery.coulombSlopeMw)),
        p50: percentile(
          samples
            .map((s) => s.battery.coulombSlopeMw)
            .filter((v): v is number => v !== null)
            .sort((a, b) => a - b),
          50,
        ),
        p95: percentile(
          samples
            .map((s) => s.battery.coulombSlopeMw)
            .filter((v): v is number => v !== null)
            .sort((a, b) => a - b),
          95,
        ),
      },
    },
    pipeline: {
      fps: stats(samples.map((s) => s.pipeline?.fps ?? null)),
      streamFrameAgeMs: stats(samples.map((s) => s.pipeline?.streamFrameAgeMs ?? null)),
      captureToEncodeMs: stats(samples.map((s) => s.pipeline?.captureToEncodeMs ?? null)),
      encodeToPublishMs: stats(samples.map((s) => s.pipeline?.encodeToPublishMs ?? null)),
      glassToGlassMs: stats(samples.map((s) => s.pipeline?.glassToGlassMs ?? null)),
    },
    cpu: {
      cameraAvg: avg(samples.map((s) => s.cpu?.labosCameraPercent ?? null)),
      totalAvg: avg(samples.map((s) => s.cpu?.totalPercent ?? null)),
    },
    thermal: {
      cpuMaxC: samples.length
        ? Math.max(
            ...samples.map((s) => s.thermal?.cpuC || s.sysfsThermalCpuC || 0),
          ) || null
        : null,
      cpuEndC: last?.thermal?.cpuC ?? last?.sysfsThermalCpuC ?? null,
    },
    wifi: {
      txBytesPerSecAvg: avg(samples.map((s) => s.wifi.txBytesPerSec)),
      rxBytesPerSecAvg: avg(samples.map((s) => s.wifi.rxBytesPerSec)),
    },
    spikes: analyzeTraceSpikes(samples),
  };
}

export type SampleTraceOpts = {
  previewPort?: number;
  includeSlow?: boolean;
  includePipeline?: boolean;
  tier?: TraceSampleTier;
  prior?: SynchronizedTraceSample | null;
  priorWifi?: { rxBytes: number | null; txBytes: number | null; atMs: number } | null;
};

/** Fast sysfs-only sample for sub-second power/thermal spike capture. */
export async function sampleFastTrace(
  tick: number,
  opts: Pick<SampleTraceOpts, "prior"> = {},
): Promise<SynchronizedTraceSample> {
  const tickStart = Date.now();
  const [sysfs, sysfsThermal] = await Promise.all([readSysfsBatteryBatch(), readSysfsThermalMaxC()]);
  const syncSkewMs = Date.now() - tickStart;
  const atMs = tickStart;
  const voltageMv = sysfsVoltageMv(sysfs.voltageNowRaw);
  const currentRaw = Math.max(Math.abs(sysfs.currentNowRaw ?? 0), Math.abs(sysfs.currentAvgRaw ?? 0));
  const instantaneousMw =
    currentRaw > 0 && voltageMv ? measuredPowerMwFromBatteryCurrent(currentRaw, voltageMv) : null;
  const chargeCounterUah = sysfs.chargeCounterUah;
  const prior = opts.prior;
  let chargeDeltaUahSincePrior: number | null = null;
  let coulombSlopeMw: number | null = null;
  if (prior && chargeCounterUah !== null && prior.battery.chargeCounterUah !== null) {
    chargeDeltaUahSincePrior = chargeCounterUah - prior.battery.chargeCounterUah;
    const dtSec = (atMs - prior.atMs) / 1000;
    if (dtSec > 0 && chargeDeltaUahSincePrior < 0 && voltageMv) {
      coulombSlopeMw = measuredPowerMwFromChargeDelta(chargeDeltaUahSincePrior, dtSec, voltageMv);
    }
  }
  return {
    tick,
    tier: "fast",
    at: new Date(atMs).toISOString(),
    atMs,
    syncSkewMs,
    battery: {
      levelPercent: sysfs.capacityPercent,
      socFractionalPercent: socFractionalPercent(chargeCounterUah, sysfs.chargeFullUah),
      chargeCounterUah,
      chargeFullUah: sysfs.chargeFullUah,
      voltageMv,
      temperatureC: null,
      status: null,
      currentNowRaw: sysfs.currentNowRaw,
      currentAvgRaw: sysfs.currentAvgRaw,
      instantaneousMw,
      coulombSlopeMw,
      chargeDeltaUahSincePrior,
    },
    pipeline: null,
    sysfsThermalCpuC: sysfsThermal,
    cpu: null,
    thermal: sysfsThermal !== null ? { cpuC: sysfsThermal, gpuC: sysfsThermal, batteryC: null, skinC: null } : null,
    wifi: { rxBytes: null, txBytes: null, rxBytesPerSec: null, txBytesPerSec: null },
  };
}

export async function sampleSynchronizedTrace(
  tick: number,
  opts: SampleTraceOpts = {},
): Promise<SynchronizedTraceSample> {
  const previewPort = opts.previewPort ?? Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
  const includeSlow = opts.includeSlow ?? false;
  const includePipeline = opts.includePipeline ?? true;
  const tickStart = Date.now();

  const [sysfs, sysfsThermal, batteryDump, metricsJson, rxBytes, txBytes, cpu, thermal] = await Promise.all([
    readSysfsBatteryBatch(),
    readSysfsThermalMaxC(),
    includeSlow ? adbShell("dumpsys battery", 3000).then(parseBatteryDump).catch(() => parseBatteryDump("")) : Promise.resolve(parseBatteryDump("")),
    includePipeline ? previewHttpJson(previewPort, "/metrics") : Promise.resolve(null),
    includePipeline ? readNetBytes("wlan0", "rx") : Promise.resolve(null),
    includePipeline ? readNetBytes("wlan0", "tx") : Promise.resolve(null),
    includeSlow
      ? adbShell("dumpsys cpuinfo", 6000).then(parseCpuInfo).catch(() => parseCpuInfo(""))
      : Promise.resolve(null),
    includeSlow
      ? adbShell("dumpsys thermalservice", 4000).then(parseThermalDump).catch(() => parseThermalDump(""))
      : Promise.resolve(null),
  ]);

  const syncSkewMs = Date.now() - tickStart;
  const atMs = tickStart;
  const voltageMv =
    batteryDump.voltageMv && batteryDump.voltageMv > 0
      ? batteryDump.voltageMv
      : sysfsVoltageMv(sysfs.voltageNowRaw);

  const currentRaw = Math.max(
    Math.abs(sysfs.currentNowRaw ?? 0),
    Math.abs(sysfs.currentAvgRaw ?? 0),
  );
  const instantaneousMw =
    currentRaw > 0 && voltageMv
      ? measuredPowerMwFromBatteryCurrent(currentRaw, voltageMv)
      : null;

  const chargeCounterUah = sysfs.chargeCounterUah ?? batteryDump.chargeCounterUah;
  const chargeFullUah = sysfs.chargeFullUah;
  const prior = opts.prior;
  let chargeDeltaUahSincePrior: number | null = null;
  let coulombSlopeMw: number | null = null;
  if (prior && chargeCounterUah !== null && prior.battery.chargeCounterUah !== null) {
    chargeDeltaUahSincePrior = chargeCounterUah - prior.battery.chargeCounterUah;
    const dtSec = (atMs - prior.atMs) / 1000;
    if (dtSec > 0 && chargeDeltaUahSincePrior < 0 && voltageMv) {
      coulombSlopeMw = measuredPowerMwFromChargeDelta(chargeDeltaUahSincePrior, dtSec, voltageMv);
    }
  }

  const priorWifi = opts.priorWifi;
  let rxBytesPerSec: number | null = null;
  let txBytesPerSec: number | null = null;
  if (priorWifi && priorWifi.atMs < atMs) {
    const dtSec = (atMs - priorWifi.atMs) / 1000;
    if (dtSec > 0) {
      if (rxBytes !== null && priorWifi.rxBytes !== null) rxBytesPerSec = (rxBytes - priorWifi.rxBytes) / dtSec;
      if (txBytes !== null && priorWifi.txBytes !== null) txBytesPerSec = (txBytes - priorWifi.txBytes) / dtSec;
    }
  }

  return {
    tick,
    tier: opts.tier ?? "full",
    at: new Date(atMs).toISOString(),
    atMs,
    syncSkewMs,
    battery: {
      levelPercent: sysfs.capacityPercent ?? batteryDump.level,
      socFractionalPercent: socFractionalPercent(chargeCounterUah, chargeFullUah),
      chargeCounterUah,
      chargeFullUah,
      voltageMv,
      temperatureC: batteryDump.temperatureC,
      status: batteryDump.status,
      currentNowRaw: sysfs.currentNowRaw,
      currentAvgRaw: sysfs.currentAvgRaw,
      instantaneousMw,
      coulombSlopeMw,
      chargeDeltaUahSincePrior,
    },
    pipeline: parsePipelineMetrics(metricsJson),
    sysfsThermalCpuC: sysfsThermal,
    cpu,
    thermal: thermal ?? (sysfsThermal !== null ? { cpuC: sysfsThermal, gpuC: sysfsThermal, batteryC: null, skinC: null } : null),
    wifi: { rxBytes, txBytes, rxBytesPerSec, txBytesPerSec },
  };
}

export type RunTraceOpts = {
  label: string;
  durationSec: number;
  intervalMs?: number;
  /** Deep mode: fast sysfs ticks between full pipeline samples. */
  deep?: boolean;
  fastIntervalMs?: number;
  fullIntervalMs?: number;
  previewPort?: number;
  cpuEveryNTicks?: number;
  onSample?: (sample: SynchronizedTraceSample) => void;
  outPath?: string;
};

export async function runSynchronizedTrace(opts: RunTraceOpts): Promise<{
  samples: SynchronizedTraceSample[];
  summary: TraceSeriesSummary;
  outPath: string;
}> {
  if (opts.deep) {
    return runDeepSynchronizedTrace(opts);
  }

  const intervalMs = Math.max(50, opts.intervalMs ?? 2000);
  const cpuEveryNTicks = Math.max(1, opts.cpuEveryNTicks ?? 3);
  const outPath = opts.outPath ?? "";
  const samples: SynchronizedTraceSample[] = [];
  const deadline = Date.now() + opts.durationSec * 1000;
  let prior: SynchronizedTraceSample | null = null;
  let priorWifi: { rxBytes: number | null; txBytes: number | null; atMs: number } | null = null;
  let tick = 0;

  while (Date.now() <= deadline || samples.length === 0) {
    tick += 1;
    const sample = await sampleSynchronizedTrace(tick, {
      previewPort: opts.previewPort,
      includeSlow: tick === 1 || tick % cpuEveryNTicks === 0,
      tier: "full",
      prior,
      priorWifi,
    });
    samples.push(sample);
    if (outPath) fs.appendFileSync(outPath, `${JSON.stringify(sample)}\n`);
    opts.onSample?.(sample);
    prior = sample;
    priorWifi = { rxBytes: sample.wifi.rxBytes, txBytes: sample.wifi.txBytes, atMs: sample.atMs };
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const summary = summarizeTraceSeries(samples);
  if (outPath) {
    fs.writeFileSync(outPath.replace(/\.jsonl$/, ".summary.json"), JSON.stringify({ label: opts.label, ...summary }, null, 2));
  }
  return { samples, summary, outPath };
}

/** High-frequency trace: fast sysfs ticks + periodic full pipeline/thermal samples. */
export async function runDeepSynchronizedTrace(opts: RunTraceOpts): Promise<{
  samples: SynchronizedTraceSample[];
  summary: TraceSeriesSummary;
  outPath: string;
}> {
  const fastIntervalMs = Math.max(50, opts.fastIntervalMs ?? Number(process.env.LABOS_TRACE_FAST_INTERVAL_MS || 100));
  const fullIntervalMs = Math.max(fastIntervalMs, opts.fullIntervalMs ?? Number(process.env.LABOS_TRACE_FULL_INTERVAL_MS || 2000));
  const fullEveryNTicks = Math.max(1, Math.round(fullIntervalMs / fastIntervalMs));
  const cpuEveryFullTicks = Math.max(1, opts.cpuEveryNTicks ?? 1);
  const outPath = opts.outPath ?? "";
  const samples: SynchronizedTraceSample[] = [];
  const deadline = Date.now() + opts.durationSec * 1000;
  let prior: SynchronizedTraceSample | null = null;
  let priorWifi: { rxBytes: number | null; txBytes: number | null; atMs: number } | null = null;
  let fullTick = 0;
  let tick = 0;

  while (Date.now() <= deadline || samples.length === 0) {
    tick += 1;
    const isFull = tick === 1 || tick % fullEveryNTicks === 0;
    const sample = isFull
      ? await sampleSynchronizedTrace(tick, {
          previewPort: opts.previewPort,
          includeSlow: ++fullTick === 1 || fullTick % cpuEveryFullTicks === 0,
          tier: "full",
          prior,
          priorWifi,
        })
      : await sampleFastTrace(tick, { prior });
    samples.push(sample);
    if (outPath) fs.appendFileSync(outPath, `${JSON.stringify(sample)}\n`);
    opts.onSample?.(sample);
    prior = sample;
    if (sample.tier === "full") {
      priorWifi = { rxBytes: sample.wifi.rxBytes, txBytes: sample.wifi.txBytes, atMs: sample.atMs };
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, fastIntervalMs));
  }

  const summary = summarizeTraceSeries(samples);
  if (outPath) {
    fs.writeFileSync(
      outPath.replace(/\.jsonl$/, ".summary.json"),
      JSON.stringify(
        {
          label: opts.label,
          deep: true,
          fastIntervalMs,
          fullIntervalMs,
          fullEveryNTicks,
          ...summary,
        },
        null,
        2,
      ),
    );
  }
  return { samples, summary, outPath };
}

/** Wait until coulomb counter moves or timeout (for discharge-gated sweeps). */
export async function waitForCoulombMovement(opts: {
  timeoutSec?: number;
  pollMs?: number;
  previewPort?: number;
}): Promise<{ moved: boolean; deltaUah: number | null; waitedSec: number }> {
  const timeoutSec = opts.timeoutSec ?? 120;
  const pollMs = opts.pollMs ?? 3000;
  const started = Date.now();
  const first = await readSysfsBatteryBatch();
  const c0 = first.chargeCounterUah;

  while ((Date.now() - started) / 1000 < timeoutSec) {
    await new Promise((r) => setTimeout(r, pollMs));
    const next = await readSysfsBatteryBatch();
    if (c0 !== null && next.chargeCounterUah !== null && next.chargeCounterUah !== c0) {
      return { moved: true, deltaUah: next.chargeCounterUah - c0, waitedSec: Math.round((Date.now() - started) / 1000) };
    }
  }
  return { moved: false, deltaUah: null, waitedSec: Math.round((Date.now() - started) / 1000) };
}
