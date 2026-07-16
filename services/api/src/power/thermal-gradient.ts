/**
 * Thermal gradient analysis from synchronized trace samples.
 *
 * Models heating as approximately:
 *   dT_cpu/dt ≈ (P_dissipated - P_cooling) / C_thermal
 *
 * Empirical proxies: instantaneous mW, pixel rate, Wi‑Fi TX, camera CPU%.
 */
import type { SynchronizedTraceSample } from "./power-trace.js";

export type ThermalGradientPoint = {
  atMs: number;
  cpuC: number | null;
  skinC: number | null;
  batteryC: number | null;
  instantaneousMw: number | null;
  fps: number | null;
  cameraCpuPercent: number | null;
  wifiTxBytesPerSec: number | null;
};

export type ThermalGradientAnalysis = {
  samples: number;
  durationSec: number;
  cpuC: {
    start: number | null;
    end: number | null;
    max: number | null;
    delta: number | null;
    /** °C per minute (linear fit over ticks with thermal data). */
    rampRateCPerMin: number | null;
    /** Estimated seconds from start to reach threshold (if ramp positive). */
    secondsToThreshold: number | null;
    thresholdC: number;
  };
  skinC: { start: number | null; end: number | null; max: number | null; rampRateCPerMin: number | null };
  correlations: {
    cpuTempVsMw: number | null;
    cpuTempVsPixelRate: number | null;
    cpuTempVsWifiTx: number | null;
    cpuTempVsCameraCpu: number | null;
  };
  /** Mitigation score: lower ramp + lower max temp is better. */
  thermalStressScore: number | null;
  charging: boolean | null;
};

function linearSlope(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i]!, 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const den = n * sumX2 - sumX * sumX;
  if (Math.abs(den) < 1e-9) return null;
  return (n * sumXY - sumX * sumY) / den;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i]! - mx;
    const vy = ys[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? Math.round((num / den) * 1000) / 1000 : null;
}

function pairs<T>(samples: SynchronizedTraceSample[], pickX: (s: SynchronizedTraceSample) => T | null, pickY: (s: SynchronizedTraceSample) => number | null) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of samples) {
    const x = pickX(s);
    const y = pickY(s);
    if (x !== null && x !== undefined && y !== null && Number.isFinite(Number(x)) && Number.isFinite(y)) {
      xs.push(Number(x));
      ys.push(y);
    }
  }
  return { xs, ys };
}

export function analyzeThermalGradient(
  samples: SynchronizedTraceSample[],
  thresholdC = 75,
): ThermalGradientAnalysis {
  const thermalTicks = samples.filter((s) => s.thermal?.cpuC !== null && s.thermal?.cpuC !== undefined);
  const first = thermalTicks[0]?.thermal?.cpuC ?? samples[0]?.thermal?.cpuC ?? null;
  const last = thermalTicks.at(-1)?.thermal?.cpuC ?? samples.at(-1)?.thermal?.cpuC ?? null;
  const maxCpu = thermalTicks.length
    ? Math.max(...thermalTicks.map((s) => s.thermal!.cpuC!))
    : samples.length
      ? Math.max(...samples.map((s) => s.thermal?.cpuC || 0)) || null
      : null;
  const durationSec =
    samples.length > 1 ? Math.max(0, (samples.at(-1)!.atMs - samples[0]!.atMs) / 1000) : 0;

  const t0 = samples[0]?.atMs ?? 0;
  const cpuSlope = linearSlope(
    thermalTicks.map((s) => (s.atMs - t0) / 60_000),
    thermalTicks.map((s) => s.thermal!.cpuC!),
  );
  const rampPerMin = cpuSlope !== null ? Math.round(cpuSlope * 1000) / 1000 : null;
  let secondsToThreshold: number | null = null;
  if (rampPerMin !== null && rampPerMin > 0.01 && first !== null && first < thresholdC) {
    secondsToThreshold = Math.round(((thresholdC - first) / rampPerMin) * 60);
  }

  const skinTicks = samples.filter((s) => s.thermal?.skinC !== null);
  const skinSlope = linearSlope(
    skinTicks.map((s) => (s.atMs - t0) / 60_000),
    skinTicks.map((s) => s.thermal!.skinC!),
  );

  const tempMw = pairs(samples, (s) => s.battery.instantaneousMw, (s) => s.thermal?.cpuC ?? null);
  const pixelRate = pairs(
    samples,
    (s) => (s.pipeline?.fps ?? 0) * (s.pipeline ? 1 : 0),
    (s) => s.thermal?.cpuC ?? null,
  );
  const wifi = pairs(samples, (s) => s.wifi.txBytesPerSec, (s) => s.thermal?.cpuC ?? null);
  const camCpu = pairs(samples, (s) => s.cpu?.labosCameraPercent ?? null, (s) => s.thermal?.cpuC ?? null);

  const charging =
    samples[0]?.battery.status === 2 || samples[0]?.battery.status === 5
      ? true
      : samples[0]?.battery.status === 3
        ? false
        : null;

  const thermalStressScore =
    rampPerMin !== null && maxCpu !== null
      ? Math.round((rampPerMin * 10 + Math.max(0, maxCpu - 55) * 2) * 100) / 100
      : null;

  return {
    samples: samples.length,
    durationSec: Math.round(durationSec * 10) / 10,
    cpuC: {
      start: first,
      end: last,
      max: maxCpu,
      delta: first !== null && last !== null ? Math.round((last - first) * 10) / 10 : null,
      rampRateCPerMin: rampPerMin,
      secondsToThreshold,
      thresholdC,
    },
    skinC: {
      start: skinTicks[0]?.thermal?.skinC ?? null,
      end: skinTicks.at(-1)?.thermal?.skinC ?? null,
      max: skinTicks.length ? Math.max(...skinTicks.map((s) => s.thermal!.skinC!)) : null,
      rampRateCPerMin: skinSlope !== null ? Math.round(skinSlope * 1000) / 1000 : null,
    },
    correlations: {
      cpuTempVsMw: pearson(tempMw.xs, tempMw.ys),
      cpuTempVsPixelRate: pearson(pixelRate.xs, pixelRate.ys),
      cpuTempVsWifiTx: pearson(wifi.xs, wifi.ys),
      cpuTempVsCameraCpu: pearson(camCpu.xs, camCpu.ys),
    },
    thermalStressScore,
    charging,
  };
}

/** Rank mitigation candidates: minimize ramp rate and max temp. */
export function rankThermalMitigations<T extends { id: string; thermal: ThermalGradientAnalysis }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rampA = a.thermal.cpuC.rampRateCPerMin ?? 999;
    const rampB = b.thermal.cpuC.rampRateCPerMin ?? 999;
    if (rampA !== rampB) return rampA - rampB;
    const maxA = a.thermal.cpuC.max ?? 999;
    const maxB = b.thermal.cpuC.max ?? 999;
    return maxA - maxB;
  });
}
