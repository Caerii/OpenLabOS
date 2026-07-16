import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENERGY_COEFFICIENTS,
  bestEnergyAtLatency,
  energyEfficiencyScore,
  energyQualityPareto,
  estimatePreviewEnergyMw,
  fitEnergyCoefficients,
  measuredPowerMwFromChargeDelta,
} from "../src/math/energy-model.js";
import { PreviewProtocolConfigSchema } from "../src/config/schema.js";

describe("energy model", () => {
  it("infers power from charge counter discharge", () => {
    const mw = measuredPowerMwFromChargeDelta(-2000, 60, 4000);
    expect(mw).not.toBeNull();
    expect(mw!).toBeGreaterThan(400);
    expect(mw!).toBeLessThan(520);
  });

  it("hardware H.264 encode costs less than software MJPEG at same pixel rate", () => {
    const h264 = estimatePreviewEnergyMw(
      PreviewProtocolConfigSchema.parse({
        encodeMode: "hardware-h264",
        transport: "h264-annexb-http",
        width: 1280,
        height: 720,
        fps: 30,
        h264Bitrate: 2_000_000,
      }),
    );
    const mjpeg = estimatePreviewEnergyMw(
      PreviewProtocolConfigSchema.parse({
        encodeMode: "software-jpeg",
        transport: "mjpeg-http",
        width: 1280,
        height: 720,
        fps: 30,
        jpegQuality: 55,
      }),
    );
    expect(h264.subsystems.encode).toBeLessThan(mjpeg.subsystems.encode);
    expect(h264.pixelRateMpixFps).toBeCloseTo(mjpeg.pixelRateMpixFps, 1);
  });

  it("energy scales with pixel rate for sensor subsystem", () => {
    const low = estimatePreviewEnergyMw(
      PreviewProtocolConfigSchema.parse({ width: 640, height: 480, fps: 6 }),
    );
    const high = estimatePreviewEnergyMw(
      PreviewProtocolConfigSchema.parse({ width: 1280, height: 720, fps: 15 }),
    );
    expect(high.subsystems.sensor).toBeGreaterThan(low.subsystems.sensor);
  });

  it("fits coefficients from calibrated samples", () => {
    const cfg720 = PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      width: 1280,
      height: 720,
      fps: 30,
      h264Bitrate: 2_000_000,
    });
    const cfg480 = PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      width: 640,
      height: 480,
      fps: 12,
      jpegQuality: 42,
    });
    const fitted = fitEnergyCoefficients([
      { config: cfg720, measuredMw: 520 },
      { config: cfg480, measuredMw: 310 },
      { config: cfg720, measuredMw: 540, context: { thermalCpuC: 48 } },
    ]);
    expect(fitted.sensorMwPerMpixFps).toBeGreaterThan(0);
    expect(fitted.hardwareH264BaseMw).toBeGreaterThan(40);
  });

  it("finds energy pareto and best under latency ceiling", () => {
    const points = energyQualityPareto([
      { id: "a", latencyMs: 30, qualityScore: 26, totalMw: 480, energyEfficiency: energyEfficiencyScore(26, 480) },
      { id: "b", latencyMs: 90, qualityScore: 14, totalMw: 350, energyEfficiency: energyEfficiencyScore(14, 350) },
      { id: "c", latencyMs: 35, qualityScore: 20, totalMw: 520, energyEfficiency: energyEfficiencyScore(20, 520) },
    ]);
    expect(points.map((p) => p.id)).toContain("a");
    expect(points.map((p) => p.id)).toContain("b");
    expect(bestEnergyAtLatency(points, 50)?.id).toBe("a");
  });

  it("turbo jpeg uses lower encode power factor", () => {
    const base = PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      width: 640,
      height: 480,
      fps: 15,
      jpegQuality: 40,
    });
    const turbo = PreviewProtocolConfigSchema.parse({ ...base, encodeMode: "libjpeg-turbo" });
    const sw = estimatePreviewEnergyMw(base);
    const tj = estimatePreviewEnergyMw(turbo);
    expect(tj.subsystems.encode).toBeLessThan(sw.subsystems.encode);
  });
});
