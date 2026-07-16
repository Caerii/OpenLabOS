/**
 * Sub-second power / thermal spike detection from high-frequency trace series.
 */
import type { SynchronizedTraceSample } from "./power-trace.js";

export type SpikeEvent = {
  tick: number;
  atMs: number;
  metric: "instantaneousMw" | "coulombSlopeMw" | "sysfsThermalCpuC";
  value: number;
  baseline: number;
  excessRatio: number;
  durationMs: number | null;
};

export type SpikeAnalysis = {
  fastTicks: number;
  fullTicks: number;
  sampleIntervalMs: { median: number | null; min: number | null; max: number | null };
  instantaneousMw: {
    spikes: SpikeEvent[];
    spikeCount: number;
    maxMw: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  coulombSlopeMw: {
    spikes: SpikeEvent[];
    spikeCount: number;
    maxMw: number | null;
  };
  sysfsThermalCpuC: {
    spikes: SpikeEvent[];
    spikeCount: number;
    maxC: number | null;
    rampPerSecMax: number | null;
  };
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function detectSpikes(
  samples: SynchronizedTraceSample[],
  metric: SpikeEvent["metric"],
  pick: (s: SynchronizedTraceSample) => number | null,
  thresholdFactor = 1.35,
): SpikeEvent[] {
  const values = samples.map((s) => pick(s)).filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length < 4) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50) ?? sorted[0]!;
  const p95 = percentile(sorted, 95) ?? sorted.at(-1)!;
  const baseline = p50;
  const threshold = Math.max(baseline * thresholdFactor, p95);

  const spikes: SpikeEvent[] = [];
  for (let i = 0; i < samples.length; i++) {
    const value = pick(samples[i]!);
    if (value === null || value < threshold) continue;
    const prev = i > 0 ? pick(samples[i - 1]!) : null;
    const next = i < samples.length - 1 ? pick(samples[i + 1]!) : null;
    const durationMs =
      prev !== null && prev >= threshold && next !== null && next >= threshold
        ? samples[Math.min(samples.length - 1, i + 1)]!.atMs - samples[Math.max(0, i - 1)]!.atMs
        : null;
    spikes.push({
      tick: samples[i]!.tick,
      atMs: samples[i]!.atMs,
      metric,
      value: Math.round(value * 100) / 100,
      baseline: Math.round(baseline * 100) / 100,
      excessRatio: Math.round((value / Math.max(1, baseline)) * 100) / 100,
      durationMs,
    });
  }
  return spikes.slice(0, 50);
}

function intervalStats(samples: SynchronizedTraceSample[]) {
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    gaps.push(samples[i]!.atMs - samples[i - 1]!.atMs);
  }
  if (!gaps.length) return { median: null, min: null, max: null };
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 50),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

export function analyzeTraceSpikes(samples: SynchronizedTraceSample[]): SpikeAnalysis {
  const fastTicks = samples.filter((s) => s.tier === "fast").length;
  const fullTicks = samples.filter((s) => s.tier !== "fast").length;
  const mwValues = samples
    .map((s) => s.battery.instantaneousMw)
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);

  let rampPerSecMax: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!.sysfsThermalCpuC ?? samples[i - 1]!.thermal?.cpuC ?? null;
    const cur = samples[i]!.sysfsThermalCpuC ?? samples[i]!.thermal?.cpuC ?? null;
    if (prev === null || cur === null) continue;
    const dtSec = (samples[i]!.atMs - samples[i - 1]!.atMs) / 1000;
    if (dtSec <= 0) continue;
    const ramp = (cur - prev) / dtSec;
    if (rampPerSecMax === null || ramp > rampPerSecMax) rampPerSecMax = ramp;
  }

  const thermalValues = samples
    .map((s) => s.sysfsThermalCpuC ?? s.thermal?.cpuC ?? null)
    .filter((v): v is number => v !== null);

  const mwSpikes = detectSpikes(samples, "instantaneousMw", (s) => s.battery.instantaneousMw);
  const slopeSpikes = detectSpikes(samples, "coulombSlopeMw", (s) => s.battery.coulombSlopeMw, 1.5);
  const thermalSpikes = detectSpikes(
    samples,
    "sysfsThermalCpuC",
    (s) => s.sysfsThermalCpuC ?? s.thermal?.cpuC ?? null,
    1.02,
  );

  return {
    fastTicks,
    fullTicks,
    sampleIntervalMs: intervalStats(samples),
    instantaneousMw: {
      spikes: mwSpikes,
      spikeCount: mwSpikes.length,
      maxMw: mwValues.length ? mwValues.at(-1)! : null,
      p50: percentile(mwValues, 50),
      p95: percentile(mwValues, 95),
      p99: percentile(mwValues, 99),
    },
    coulombSlopeMw: {
      spikes: slopeSpikes,
      spikeCount: slopeSpikes.length,
      maxMw: samples
        .map((s) => s.battery.coulombSlopeMw)
        .filter((v): v is number => v !== null)
        .reduce((m, v) => (m === null ? v : Math.max(m, v)), null as number | null),
    },
    sysfsThermalCpuC: {
      spikes: thermalSpikes,
      spikeCount: thermalSpikes.length,
      maxC: thermalValues.length ? Math.max(...thermalValues) : null,
      rampPerSecMax: rampPerSecMax !== null ? Math.round(rampPerSecMax * 1000) / 1000 : null,
    },
  };
}
