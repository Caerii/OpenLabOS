/**
 * Physics-based on-device energy model for preview pipeline tuning.
 *
 * Power budget (first principles approximation):
 *   P_total = P_idle + P_sensor(W,H,F) + P_encode(mode, W,H,F, Q, R) + P_network(bytes/s) + P_cpu_misc + P_thermal
 *
 * Sensor/ISP readout scales ~linearly with pixel rate (W×H×F).
 * Software JPEG encode ~linear in pixel rate × quality (DCT work).
 * Hardware H.264 VENC: dominated by fixed encoder block + bitrate-dependent entropy engine.
 * WiFi: idle radio + linear in TX/RX airtime (bytes/s proxy).
 *
 * Calibrate coefficients from paired charge-counter samples via {@link fitEnergyCoefficients}.
 */
import type { PreviewProtocolConfig } from "../config/schema.js";
import { pixelRateScore, transportFramingOverheadBytes } from "./pipeline-model.js";

export type EnergySubsystem =
  | "idle"
  | "sensor"
  | "encode"
  | "network"
  | "cpuMisc"
  | "thermalPenalty";

export type PreviewEnergyBreakdown = {
  totalMw: number;
  subsystems: Record<EnergySubsystem, number>;
  mjPerFrame: number;
  whPerHour: number;
  framesPerWh: number | null;
  estimatedRuntimeHours: number | null;
  pixelRateMpixFps: number;
  modeledBytesPerSec: number | null;
};

/** Default coefficients — K900-class glasses, order-of-magnitude; refine with {@link fitEnergyCoefficients}. */
export type EnergyModelCoefficients = {
  /** Device awake baseline (mW). */
  idleMw: number;
  /** Sensor + ISP: mW per megapixel×fps. */
  sensorMwPerMpixFps: number;
  /** Software JPEG CPU: mW per MP×fps at Q=100. */
  softwareJpegMwPerMpixFpsAtQ100: number;
  /** Hardware H.264 encoder fixed overhead (mW). */
  hardwareH264BaseMw: number;
  /** H.264 entropy engine: mW per Mbps. */
  hardwareH264MwPerMbps: number;
  /** libjpeg-turbo factor vs software JPEG (0–1). */
  turboJpegPowerFactor: number;
  /** WiFi radio idle when streaming (mW). */
  wifiIdleMw: number;
  /** WiFi incremental mW per KB/s TX+RX. */
  wifiMwPerKbps: number;
  /** Non-camera CPU: mW per 1% total CPU. */
  cpuMiscMwPerPercent: number;
  /** Extra mW per °C above reference skin/CPU temp. */
  thermalMwPerCAbove: number;
  thermalReferenceC: number;
};

export const DEFAULT_ENERGY_COEFFICIENTS: EnergyModelCoefficients = {
  idleMw: 145,
  sensorMwPerMpixFps: 4.2,
  softwareJpegMwPerMpixFpsAtQ100: 8.5,
  hardwareH264BaseMw: 95,
  hardwareH264MwPerMbps: 12,
  turboJpegPowerFactor: 0.55,
  wifiIdleMw: 38,
  wifiMwPerKbps: 0.85,
  cpuMiscMwPerPercent: 2.8,
  thermalMwPerCAbove: 3.5,
  thermalReferenceC: 42,
};

export type EnergyObservationContext = {
  frameBytes?: number | null;
  fps?: number | null;
  cpuCameraPercent?: number | null;
  cpuTotalPercent?: number | null;
  wifiTxBytesPerSec?: number | null;
  wifiRxBytesPerSec?: number | null;
  thermalCpuC?: number | null;
  batteryVoltageMv?: number | null;
  batteryCapacityMah?: number | null;
};

export type CalibratedEnergySample = {
  config: PreviewProtocolConfig;
  measuredMw: number;
  context?: EnergyObservationContext;
};

/** Infer average power (mW) from charge-counter discharge over an interval. */
export function measuredPowerMwFromChargeDelta(
  chargeDeltaUah: number,
  durationSec: number,
  voltageMv: number,
): number | null {
  if (!Number.isFinite(chargeDeltaUah) || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (!Number.isFinite(voltageMv) || voltageMv <= 0) return null;
  if (chargeDeltaUah >= 0) return null;
  const dischargeMah = Math.abs(chargeDeltaUah) / 1000;
  const hours = durationSec / 3600;
  const currentMa = dischargeMah / hours;
  return (currentMa * voltageMv) / 1000;
}

function clampMw(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

function encodePowerMw(config: PreviewProtocolConfig, mpixFps: number, coeffs: EnergyModelCoefficients): number {
  const qFactor = Math.max(0.2, Math.min(1, config.jpegQuality / 100));
  switch (config.encodeMode) {
    case "hardware-h264": {
      const mbps = config.h264Bitrate / 1_000_000;
      return coeffs.hardwareH264BaseMw + coeffs.hardwareH264MwPerMbps * mbps;
    }
    case "libjpeg-turbo":
      return coeffs.softwareJpegMwPerMpixFpsAtQ100 * mpixFps * qFactor * coeffs.turboJpegPowerFactor;
    case "software-jpeg":
    default:
      return coeffs.softwareJpegMwPerMpixFpsAtQ100 * mpixFps * qFactor;
  }
}

function modeledBytesPerSec(config: PreviewProtocolConfig, ctx: EnergyObservationContext): number | null {
  if (ctx.frameBytes && ctx.fps) {
    const payload = ctx.frameBytes * ctx.fps;
    return payload + transportFramingOverheadBytes(config.transport, ctx.frameBytes) * ctx.fps;
  }
  if (config.encodeMode === "hardware-h264") {
    return config.h264Bitrate / 8 + transportFramingOverheadBytes(config.transport, config.h264Bitrate / 8 / config.fps);
  }
  const pixels = config.width * config.height;
  const q = config.jpegQuality / 100;
  const estFrameBytes = Math.max(2048, Math.round(pixels * 0.08 * q + 512));
  return estFrameBytes * config.fps + transportFramingOverheadBytes(config.transport, estFrameBytes) * config.fps;
}

function networkPowerMw(
  config: PreviewProtocolConfig,
  ctx: EnergyObservationContext,
  coeffs: EnergyModelCoefficients,
): number {
  const tx = ctx.wifiTxBytesPerSec ?? null;
  const rx = ctx.wifiRxBytesPerSec ?? null;
  let kbps: number;
  if (tx !== null && rx !== null) {
    kbps = (tx + rx) / 1024;
  } else {
    const bps = modeledBytesPerSec(config, ctx);
    kbps = bps !== null ? bps / 1024 : 0;
  }
  const streaming = kbps > 0.5;
  return streaming ? coeffs.wifiIdleMw + coeffs.wifiMwPerKbps * kbps : coeffs.wifiIdleMw * 0.15;
}

function thermalPenaltyMw(ctx: EnergyObservationContext, coeffs: EnergyModelCoefficients): number {
  const temp = ctx.thermalCpuC;
  if (temp === null || temp === undefined || !Number.isFinite(temp)) return 0;
  const delta = Math.max(0, temp - coeffs.thermalReferenceC);
  return coeffs.thermalMwPerCAbove * delta;
}

/** Analytical preview power estimate from protocol config + optional runtime observations. */
export function estimatePreviewEnergyMw(
  config: PreviewProtocolConfig,
  ctx: EnergyObservationContext = {},
  coeffs: EnergyModelCoefficients = DEFAULT_ENERGY_COEFFICIENTS,
): PreviewEnergyBreakdown {
  const fps = ctx.fps && ctx.fps > 0 ? ctx.fps : config.fps;
  const mpixFps = pixelRateScore(config.width, config.height, fps);

  const idle = coeffs.idleMw;
  const sensor = coeffs.sensorMwPerMpixFps * mpixFps;
  const encode = encodePowerMw(config, mpixFps, coeffs);
  const network = networkPowerMw(config, { ...ctx, fps }, coeffs);
  const cpuMisc =
    coeffs.cpuMiscMwPerPercent *
    Math.max(0, (ctx.cpuTotalPercent ?? 0) - (ctx.cpuCameraPercent ?? 0));
  const thermalPenalty = thermalPenaltyMw(ctx, coeffs);

  const totalMw = clampMw(idle + sensor + encode + network + cpuMisc + thermalPenalty);
  const mjPerFrame = fps > 0 ? clampMw(totalMw / fps) : 0;
  const whPerHour = totalMw / 1000;
  const framesPerWh = whPerHour > 0 && fps > 0 ? Math.round((fps * 3600) / whPerHour) : null;

  let estimatedRuntimeHours: number | null = null;
  const capacity = ctx.batteryCapacityMah;
  const voltage = ctx.batteryVoltageMv ?? 3700;
  if (capacity && capacity > 0 && totalMw > 0) {
    const whRemaining = (capacity * voltage) / 1_000_000;
    estimatedRuntimeHours = Math.round((whRemaining / whPerHour) * 100) / 100;
  }

  return {
    totalMw,
    subsystems: {
      idle: clampMw(idle),
      sensor: clampMw(sensor),
      encode: clampMw(encode),
      network: clampMw(network),
      cpuMisc: clampMw(cpuMisc),
      thermalPenalty: clampMw(thermalPenalty),
    },
    mjPerFrame,
    whPerHour,
    framesPerWh,
    estimatedRuntimeHours,
    pixelRateMpixFps: Math.round(mpixFps * 100) / 100,
    modeledBytesPerSec: modeledBytesPerSec(config, { ...ctx, fps }),
  };
}

/** Quality per milliwatt — higher is better energy efficiency at same perceptual Q proxy. */
export function energyEfficiencyScore(qualityScore: number, totalMw: number): number {
  if (!Number.isFinite(totalMw) || totalMw <= 0) return 0;
  return Math.round((qualityScore / totalMw) * 1000) / 1000;
}

/** Energy–latency–quality triple: minimize energy & latency, maximize quality. */
export type EnergyLatencyQualityPoint = {
  id: string;
  latencyMs: number;
  qualityScore: number;
  totalMw: number;
  energyEfficiency: number;
};

export function energyQualityPareto<T extends EnergyLatencyQualityPoint>(points: T[]): T[] {
  return points
    .filter(
      (a) =>
        !points.some(
          (b) =>
            b !== a &&
            b.totalMw <= a.totalMw &&
            b.latencyMs <= a.latencyMs &&
            b.qualityScore >= a.qualityScore &&
            (b.totalMw < a.totalMw || b.latencyMs < a.latencyMs || b.qualityScore > a.qualityScore),
        ),
    )
    .sort((a, b) => a.totalMw - b.totalMw || a.latencyMs - b.latencyMs);
}

/**
 * Fit sensor + encode split from labeled samples (least-squares on MP×fps axes).
 * Returns refined coefficients; other terms unchanged from defaults.
 */
export function fitEnergyCoefficients(
  samples: CalibratedEnergySample[],
  base: EnergyModelCoefficients = DEFAULT_ENERGY_COEFFICIENTS,
): EnergyModelCoefficients {
  if (samples.length < 2) return { ...base };

  const h264Samples = samples.filter((s) => s.config.encodeMode === "hardware-h264");
  const jpegSamples = samples.filter((s) => s.config.encodeMode !== "hardware-h264");

  let sensorMwPerMpixFps = base.sensorMwPerMpixFps;
  if (jpegSamples.length >= 2) {
    const pairs = jpegSamples.map((s) => {
      const mpix = pixelRateScore(s.config.width, s.config.height, s.config.fps);
      const q = s.config.jpegQuality / 100;
      const encodeEst =
        base.softwareJpegMwPerMpixFpsAtQ100 * mpix * q * (s.config.encodeMode === "libjpeg-turbo" ? base.turboJpegPowerFactor : 1);
      const residual = s.measuredMw - base.idleMw - encodeEst - base.wifiIdleMw * 0.5;
      return { mpix, residual };
    });
    const num = pairs.reduce((s, p) => s + p.mpix * p.residual, 0);
    const den = pairs.reduce((s, p) => s + p.mpix * p.mpix, 0);
    if (den > 0) sensorMwPerMpixFps = Math.max(0.5, num / den);
  }

  let hardwareH264BaseMw = base.hardwareH264BaseMw;
  let hardwareH264MwPerMbps = base.hardwareH264MwPerMbps;
  if (h264Samples.length >= 2) {
    const rows = h264Samples.map((s) => {
      const mpix = pixelRateScore(s.config.width, s.config.height, s.config.fps);
      const mbps = s.config.h264Bitrate / 1_000_000;
      const residual = s.measuredMw - base.idleMw - sensorMwPerMpixFps * mpix - base.wifiIdleMw;
      return { mbps, residual };
    });
    const n = rows.length;
    const sumMbps = rows.reduce((s, r) => s + r.mbps, 0);
    const sumRes = rows.reduce((s, r) => s + r.residual, 0);
    const sumMbps2 = rows.reduce((s, r) => s + r.mbps * r.mbps, 0);
    const sumMbpsRes = rows.reduce((s, r) => s + r.mbps * r.residual, 0);
    const det = n * sumMbps2 - sumMbps * sumMbps;
    if (Math.abs(det) > 1e-6) {
      hardwareH264BaseMw = Math.max(40, (sumRes * sumMbps2 - sumMbps * sumMbpsRes) / det);
      hardwareH264MwPerMbps = Math.max(2, (n * sumMbpsRes - sumMbps * sumRes) / det);
    }
  }

  return {
    ...base,
    sensorMwPerMpixFps: Math.round(sensorMwPerMpixFps * 100) / 100,
    hardwareH264BaseMw: Math.round(hardwareH264BaseMw * 100) / 100,
    hardwareH264MwPerMbps: Math.round(hardwareH264MwPerMbps * 100) / 100,
  };
}

/** Rank configs by lowest energy at latency ceiling with minimum quality. */
export function bestEnergyAtLatency<T extends EnergyLatencyQualityPoint>(
  points: T[],
  maxLatencyMs: number,
  minQuality = 0,
): T | null {
  return (
    points
      .filter(
        (p) =>
          Number.isFinite(p.latencyMs) &&
          p.latencyMs <= maxLatencyMs &&
          p.qualityScore >= minQuality &&
          Number.isFinite(p.totalMw),
      )
      .sort((a, b) => a.totalMw - b.totalMw || b.qualityScore - a.qualityScore)[0] ?? null
  );
}
