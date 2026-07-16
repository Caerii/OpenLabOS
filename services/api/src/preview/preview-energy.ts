import type { PreviewProtocolConfig } from "@openlabos/preview";
import {
  DEFAULT_ENERGY_COEFFICIENTS,
  type CalibratedEnergySample,
  type EnergyModelCoefficients,
  type EnergyObservationContext,
  type PreviewEnergyBreakdown,
  estimatePreviewEnergyMw,
  fitEnergyCoefficients,
  measuredPowerMwFromChargeDelta,
} from "@openlabos/preview";
import type { PowerSample } from "../power/power-profiler.js";
import { getPreviewProtocolConfig } from "./preview-protocol-config.js";

let calibratedCoeffs: EnergyModelCoefficients = { ...DEFAULT_ENERGY_COEFFICIENTS };
const calibrationSamples: CalibratedEnergySample[] = [];

export function getEnergyModelCoefficients(): EnergyModelCoefficients {
  return { ...calibratedCoeffs };
}

export function setEnergyModelCoefficients(coeffs: EnergyModelCoefficients) {
  calibratedCoeffs = { ...coeffs };
}

export function recordEnergyCalibrationSample(sample: CalibratedEnergySample) {
  calibrationSamples.push(sample);
  if (calibrationSamples.length >= 2) {
    calibratedCoeffs = fitEnergyCoefficients(calibrationSamples, DEFAULT_ENERGY_COEFFICIENTS);
  }
}

export function getEnergyCalibrationSamples(): CalibratedEnergySample[] {
  return [...calibrationSamples];
}

export function resetEnergyModelForTests() {
  calibratedCoeffs = { ...DEFAULT_ENERGY_COEFFICIENTS };
  calibrationSamples.length = 0;
}

export function powerSampleToEnergyContext(
  sample: PowerSample,
  fps?: number,
  frameBytes?: number,
): EnergyObservationContext {
  return {
    fps: fps ?? sample.preview?.fps ?? null,
    frameBytes: frameBytes ?? sample.preview?.frameBytes ?? null,
    cpuCameraPercent: sample.cpu.labosCameraPercent,
    cpuTotalPercent: sample.cpu.totalPercent,
    wifiTxBytesPerSec: null,
    wifiRxBytesPerSec: null,
    thermalCpuC: sample.thermal.cpuC,
    batteryVoltageMv: sample.battery.voltageMv,
  };
}

export function inferPowerMwFromSamples(first: PowerSample, last: PowerSample): number | null {
  if (!first || !last) return null;
  const durationSec = Math.max(0, (last.atMs - first.atMs) / 1000);
  const chargeDelta = last.battery.chargeCounterUah !== null && first.battery.chargeCounterUah !== null
    ? last.battery.chargeCounterUah - first.battery.chargeCounterUah
    : null;
  if (chargeDelta === null) return null;
  return measuredPowerMwFromChargeDelta(chargeDelta, durationSec, first.battery.voltageMv ?? 3700);
}

export function estimatePreviewEnergy(
  config: PreviewProtocolConfig = getPreviewProtocolConfig(),
  ctx: EnergyObservationContext = {},
): PreviewEnergyBreakdown {
  return estimatePreviewEnergyMw(config, ctx, calibratedCoeffs);
}

export function previewEnergySnapshot(ctx: EnergyObservationContext = {}) {
  const config = getPreviewProtocolConfig();
  const breakdown = estimatePreviewEnergy(config, ctx);
  return {
    ok: true,
    config,
    coefficients: calibratedCoeffs,
    calibrationSamples: calibrationSamples.length,
    breakdown,
    updatedAtMs: Date.now(),
  };
}
