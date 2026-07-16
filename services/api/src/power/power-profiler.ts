import fs from "node:fs";
import path from "node:path";
import {
  estimatePreviewEnergyMw,
  measuredPowerMwFromChargeDelta,
  type PreviewProtocolConfig,
} from "@openlabos/preview";
import { adbShell } from "../adb.js";
import { dashboardApiPort } from "../runtime-config.js";
import { updateLabosSettings } from "../lib/labos-settings.js";

export type CaptureDensity = "low" | "balanced" | "high";

export interface CaptureDensityProfile {
  video_width: number;
  video_height: number;
  video_fps: number;
  video_bitrate: number;
  stream_width: number;
  stream_height: number;
  stream_jpeg_quality: number;
  stream_fps: number;
  camera_keep_alive_ms: number;
}

export interface PowerSample {
  at: string;
  atMs: number;
  battery: {
    level: number | null;
    voltageMv: number | null;
    temperatureC: number | null;
    chargeCounterUah: number | null;
    status: number | null;
    /** Raw sysfs current_now (device-specific units; see inferMeasuredPowerMw). */
    currentNowRaw: number | null;
    /** Raw sysfs current_avg (device-specific units; see inferMeasuredPowerMw). */
    currentAvgRaw: number | null;
  };
  cpu: {
    load: string | null;
    totalPercent: number | null;
    labosCorePercent: number | null;
    labosCameraPercent: number | null;
    dashboardPercent: number | null;
    adbdPercent: number | null;
  };
  thermal: {
    cpuC: number | null;
    gpuC: number | null;
    batteryC: number | null;
    skinC: number | null;
  };
  wifi: {
    rxBytes: number | null;
    txBytes: number | null;
  };
  preview: {
    ok: boolean;
    streaming: boolean;
    recording: boolean;
    frameCount: number;
    fps: number;
    frameBytes: number;
  } | null;
}

export interface PowerProfileSummary {
  label: string;
  startedAt: string;
  endedAt: string;
  samples: number;
  durationSec: number;
  batteryDeltaPercent: number | null;
  chargeDeltaUah: number | null;
  estimatedAverageCurrentMa: number | null;
  measuredTotalMw: number | null;
  modeledTotalMw: number | null;
  energySubsystems: Record<string, number> | null;
  wifiRxBytes: number | null;
  wifiTxBytes: number | null;
  wifiBytesPerSec: number | null;
  previewFrameDelta: number | null;
  previewBytesPerFrame: number | null;
  previewFramesPerWattHourProxy: number | null;
  avgCpuPercent: number | null;
  avgCameraCpuPercent: number | null;
  avgCoreCpuPercent: number | null;
  maxCpuTempC: number | null;
}

export const CAPTURE_DENSITY_PROFILES: Record<CaptureDensity, CaptureDensityProfile> = {
  low: {
    video_width: 854,
    video_height: 480,
    video_fps: 10,
    video_bitrate: 2_000_000,
    stream_width: 640,
    stream_height: 480,
    stream_jpeg_quality: 35,
    stream_fps: 12,
    camera_keep_alive_ms: 3_000,
  },
  balanced: {
    video_width: 1280,
    video_height: 720,
    video_fps: 15,
    video_bitrate: 4_000_000,
    stream_width: 640,
    stream_height: 480,
    stream_jpeg_quality: 42,
    stream_fps: 12,
    camera_keep_alive_ms: 5_000,
  },
  high: {
    video_width: 1920,
    video_height: 1080,
    video_fps: 30,
    video_bitrate: 8_000_000,
    stream_width: 1280,
    stream_height: 720,
    stream_jpeg_quality: 42,
    stream_fps: 15,
    camera_keep_alive_ms: 30_000,
  },
};

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentLine(output: string, processName: string) {
  const escaped = processName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`\\n\\s*([0-9.]+)%\\s+\\d+/${escaped}`));
  return match ? Number(match[1]) : null;
}

export function parseBatteryDump(output: string): PowerSample["battery"] {
  return {
    level: numberValue(output.match(/level:\s*(-?\d+)/)?.[1]),
    voltageMv: numberValue(output.match(/voltage:\s*(-?\d+)/)?.[1]),
    temperatureC: (() => {
      const raw = numberValue(output.match(/temperature:\s*(-?\d+)/)?.[1]);
      return raw === null ? null : raw / 10;
    })(),
    chargeCounterUah: numberValue(output.match(/Charge counter:\s*(-?\d+)/)?.[1]),
    status: numberValue(output.match(/status:\s*(-?\d+)/)?.[1]),
  };
}

export function parseCpuInfo(output: string): PowerSample["cpu"] {
  return {
    load: output.match(/Load:\s*([^\n]+)/)?.[1]?.trim() || null,
    totalPercent: numberValue(output.match(/\n\s*([0-9.]+)%\s+TOTAL:/)?.[1]),
    labosCorePercent: parsePercentLine(output, "com.openlab.labos.core"),
    labosCameraPercent: parsePercentLine(output, "com.openlab.labos.camera"),
    dashboardPercent: parsePercentLine(output, "com.openlab.labos.dashboard"),
    adbdPercent: parsePercentLine(output, "adbd"),
  };
}

export function parseThermalDump(output: string): PowerSample["thermal"] {
  const current = output.includes("Current temperatures from HAL:")
    ? output.slice(output.indexOf("Current temperatures from HAL:"))
    : output;
  const temp = (name: string) => {
    const match = current.match(new RegExp(`Temperature\\{mValue=([0-9.\\-]+),[^}]*mName=${name}\\b`));
    return match ? Number(match[1]) : null;
  };
  return {
    cpuC: temp("CPU"),
    gpuC: temp("GPU"),
    batteryC: temp("BATTERY"),
    skinC: temp("SKIN"),
  };
}

function readNetBytes(iface: string, direction: "rx" | "tx") {
  const stat = direction === "rx" ? "rx_bytes" : "tx_bytes";
  return adbShell(`cat /sys/class/net/${iface}/statistics/${stat}`, 3000)
    .then((value) => numberValue(value.trim()))
    .catch(() => null);
}

async function fetchPreviewHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  timeout.unref?.();
  try {
    const response = await fetch(`http://127.0.0.1:${dashboardApiPort()}/api/preview/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = await response.json() as any;
    return {
      ok: json.ok === true,
      streaming: json.streaming === true,
      recording: json.recording === true,
      frameCount: Number(json.frameCount || 0),
      fps: Number(json.fps || 0),
      frameBytes: Number(json.frameBytes || 0),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readBatteryCurrentRaw() {
  const read = (path: string) =>
    adbShell(`cat ${path}`, 2000)
      .then((value) => numberValue(value.trim()))
      .catch(() => null);
  return Promise.all([
    read("/sys/class/power_supply/battery/current_now"),
    read("/sys/class/power_supply/battery/current_avg"),
    read("/sys/class/power_supply/battery/voltage_now"),
  ]).then(([currentNowRaw, currentAvgRaw, voltageNowRaw]) => ({
    currentNowRaw,
    currentAvgRaw,
    voltageNowRaw,
  }));
}

function sysfsVoltageMv(voltageNowRaw: number | null): number | null {
  if (voltageNowRaw === null || !Number.isFinite(voltageNowRaw)) return null;
  // sysfs voltage_now is µV on MTK; dumpsys uses mV.
  return voltageNowRaw > 10000 ? Math.round(voltageNowRaw / 1000) : voltageNowRaw;
}

/**
 * Convert fuel-gauge current to mW. MTK/Mentra-class devices report current_avg in
 * 0.1 mA steps (e.g. 1500 → 150 mA) when magnitude stays below ~20000.
 */
export function measuredPowerMwFromBatteryCurrent(currentRaw: number, voltageMv: number): number | null {
  if (!Number.isFinite(currentRaw) || !Number.isFinite(voltageMv) || voltageMv <= 0) return null;
  const magnitude = Math.abs(currentRaw);
  if (magnitude < 1) return null;
  const currentMa = magnitude < 20000 ? magnitude * 0.1 : magnitude / 1000;
  return Math.round(((currentMa * voltageMv) / 1000) * 100) / 100;
}

/** Prefer charge-counter discharge; fall back to averaged sysfs current on full-battery stalls. */
export function inferMeasuredPowerMw(samples: PowerSample[]): {
  mw: number | null;
  method: "charge-counter" | "sysfs-current" | "unavailable";
  chargeDeltaUah: number | null;
} {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return { mw: null, method: "unavailable", chargeDeltaUah: null };

  const durationSec = Math.max(0, (last.atMs - first.atMs) / 1000);
  const chargeDeltaUah =
    first.battery.chargeCounterUah !== null && last.battery.chargeCounterUah !== null
      ? last.battery.chargeCounterUah - first.battery.chargeCounterUah
      : null;

  if (chargeDeltaUah !== null && chargeDeltaUah < 0 && durationSec > 0) {
    const mw = measuredPowerMwFromChargeDelta(chargeDeltaUah, durationSec, first.battery.voltageMv ?? 3700);
    if (mw !== null) return { mw, method: "charge-counter", chargeDeltaUah };
  }

  const avgCurrentRaw = avg(
    samples.map((s) => {
      const now = s.battery.currentNowRaw;
      const avg = s.battery.currentAvgRaw;
      const magnitudes = [now, avg]
        .filter((v): v is number => v !== null && Number.isFinite(v))
        .map((v) => Math.abs(v));
      if (!magnitudes.length) return null;
      return Math.max(...magnitudes);
    }),
  );
  const voltageMv = avg(samples.map((s) => s.battery.voltageMv)) ?? first.battery.voltageMv ?? 3700;
  if (avgCurrentRaw !== null) {
    const mw = measuredPowerMwFromBatteryCurrent(avgCurrentRaw, voltageMv);
    if (mw !== null && mw > 20) return { mw, method: "sysfs-current", chargeDeltaUah };
  }

  return { mw: null, method: "unavailable", chargeDeltaUah };
}

export async function samplePower(): Promise<PowerSample> {
  const [batteryDump, currentRaw, cpu, thermal, rxBytes, txBytes, preview] = await Promise.all([
    adbShell("dumpsys battery", 5000).then(parseBatteryDump).catch(() => parseBatteryDump("")),
    readBatteryCurrentRaw(),
    adbShell("dumpsys cpuinfo", 8000).then(parseCpuInfo).catch(() => parseCpuInfo("")),
    adbShell("dumpsys thermalservice", 5000).then(parseThermalDump).catch(() => parseThermalDump("")),
    readNetBytes("wlan0", "rx"),
    readNetBytes("wlan0", "tx"),
    fetchPreviewHealth(),
  ]);
  const battery = {
    ...batteryDump,
    currentNowRaw: currentRaw.currentNowRaw,
    currentAvgRaw: currentRaw.currentAvgRaw,
    voltageMv:
      batteryDump.voltageMv && batteryDump.voltageMv > 0
        ? batteryDump.voltageMv
        : sysfsVoltageMv(currentRaw.voltageNowRaw),
  };

  return {
    at: new Date().toISOString(),
    atMs: Date.now(),
    battery,
    cpu,
    thermal,
    wifi: { rxBytes, txBytes },
    preview,
  };
}

function avg(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function delta(first: number | null | undefined, last: number | null | undefined) {
  if (!Number.isFinite(Number(first)) || !Number.isFinite(Number(last))) return null;
  return Number(last) - Number(first);
}

export function summarizePowerSamples(
  label: string,
  samples: PowerSample[],
  previewConfig?: PreviewProtocolConfig | null,
): PowerProfileSummary {
  const first = samples[0];
  const last = samples.at(-1);
  const durationSec = first && last ? Math.max(0, (last.atMs - first.atMs) / 1000) : 0;
  const chargeDeltaUah = first && last ? delta(first.battery.chargeCounterUah, last.battery.chargeCounterUah) : null;
  const dischargeUah = chargeDeltaUah !== null && chargeDeltaUah < 0 ? Math.abs(chargeDeltaUah) : null;
  const hours = durationSec / 3600;
  const estimatedAverageCurrentMa = dischargeUah !== null && hours > 0 ? (dischargeUah / 1000) / hours : null;
  const wifiRxBytes = first && last ? delta(first.wifi.rxBytes, last.wifi.rxBytes) : null;
  const wifiTxBytes = first && last ? delta(first.wifi.txBytes, last.wifi.txBytes) : null;
  const previewFrameDelta = first?.preview && last?.preview ? delta(first.preview.frameCount, last.preview.frameCount) : null;
  const avgFrameBytes = avg(samples.map((sample) => sample.preview?.frameBytes || null));
  const estimatedWhProxy = dischargeUah !== null && first?.battery.voltageMv
    ? (dischargeUah / 1_000_000) * (first.battery.voltageMv / 1000)
    : null;
  const measuredTotalMw =
    chargeDeltaUah !== null && durationSec > 0 && first?.battery.voltageMv
      ? measuredPowerMwFromChargeDelta(chargeDeltaUah, durationSec, first.battery.voltageMv)
      : estimatedAverageCurrentMa !== null && first?.battery.voltageMv
        ? (estimatedAverageCurrentMa * first.battery.voltageMv) / 1000
        : null;

  let modeledTotalMw: number | null = null;
  let energySubsystems: Record<string, number> | null = null;
  if (previewConfig) {
    const wifiBytesPerSec =
      durationSec > 0 && wifiRxBytes !== null && wifiTxBytes !== null
        ? (wifiRxBytes + wifiTxBytes) / durationSec
        : null;
    const breakdown = estimatePreviewEnergyMw(previewConfig, {
      fps: avg(samples.map((s) => s.preview?.fps ?? null)) ?? previewConfig.fps,
      frameBytes: avgFrameBytes,
      cpuCameraPercent: avg(samples.map((s) => s.cpu.labosCameraPercent)),
      cpuTotalPercent: avg(samples.map((s) => s.cpu.totalPercent)),
      wifiTxBytesPerSec: wifiBytesPerSec !== null ? wifiBytesPerSec * 0.6 : null,
      wifiRxBytesPerSec: wifiBytesPerSec !== null ? wifiBytesPerSec * 0.4 : null,
      thermalCpuC: Math.max(...samples.map((s) => s.thermal.cpuC || 0)) || null,
      batteryVoltageMv: first?.battery.voltageMv ?? null,
    });
    modeledTotalMw = breakdown.totalMw;
    energySubsystems = breakdown.subsystems;
  }

  return {
    label,
    startedAt: first?.at || "",
    endedAt: last?.at || "",
    samples: samples.length,
    durationSec,
    batteryDeltaPercent: first && last ? delta(first.battery.level, last.battery.level) : null,
    chargeDeltaUah,
    estimatedAverageCurrentMa,
    measuredTotalMw,
    modeledTotalMw,
    energySubsystems,
    wifiRxBytes,
    wifiTxBytes,
    wifiBytesPerSec: durationSec > 0 && wifiRxBytes !== null && wifiTxBytes !== null
      ? (wifiRxBytes + wifiTxBytes) / durationSec
      : null,
    previewFrameDelta,
    previewBytesPerFrame: avgFrameBytes,
    previewFramesPerWattHourProxy: estimatedWhProxy && previewFrameDelta !== null
      ? previewFrameDelta / estimatedWhProxy
      : null,
    avgCpuPercent: avg(samples.map((sample) => sample.cpu.totalPercent)),
    avgCameraCpuPercent: avg(samples.map((sample) => sample.cpu.labosCameraPercent)),
    avgCoreCpuPercent: avg(samples.map((sample) => sample.cpu.labosCorePercent)),
    maxCpuTempC: Math.max(...samples.map((sample) => sample.thermal.cpuC || 0)) || null,
  };
}

export async function applyCaptureDensityProfile(density: CaptureDensity) {
  const profile = CAPTURE_DENSITY_PROFILES[density];
  await updateLabosSettings(profile, 300);
  return profile;
}

export async function runPowerProfile(opts: {
  label: string;
  durationSec: number;
  intervalSec: number;
  density?: CaptureDensity | null;
  previewConfig?: PreviewProtocolConfig | null;
  outDir?: string;
}) {
  if (opts.density) await applyCaptureDensityProfile(opts.density);
  const safeLabel = opts.label.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
  const outDir = opts.outDir || path.resolve(process.cwd(), "data", "power-profiles");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeLabel}.jsonl`);
  const samples: PowerSample[] = [];
  const deadline = Date.now() + opts.durationSec * 1000;
  const intervalMs = Math.max(1000, opts.intervalSec * 1000);

  while (Date.now() <= deadline || samples.length === 0) {
    const sample = await samplePower();
    samples.push(sample);
    fs.appendFileSync(outPath, `${JSON.stringify(sample)}\n`);
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const summary = summarizePowerSamples(opts.label, samples, opts.previewConfig ?? null);
  fs.writeFileSync(outPath.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(summary, null, 2));
  return { outPath, summary };
}
