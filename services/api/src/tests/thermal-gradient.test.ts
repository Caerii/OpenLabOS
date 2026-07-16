import assert from "node:assert/strict";
import { analyzeThermalGradient, rankThermalMitigations } from "../power/thermal-gradient.js";
import type { SynchronizedTraceSample } from "../power/power-trace.js";

function tick(i: number, cpuC: number, mw: number): SynchronizedTraceSample {
  return {
    tick: i,
    tier: "full",
    at: new Date(i * 2000).toISOString(),
    atMs: i * 2000,
    syncSkewMs: 50,
    battery: {
      levelPercent: 100,
      socFractionalPercent: 99.9,
      chargeCounterUah: 2_946_000,
      chargeFullUah: 2_946_000,
      voltageMv: 4200,
      temperatureC: 25,
      status: 2,
      currentNowRaw: 1200,
      currentAvgRaw: 900,
      instantaneousMw: mw,
      coulombSlopeMw: null,
      chargeDeltaUahSincePrior: null,
    },
    pipeline: {
      streamFrameAgeMs: 10,
      fps: 30,
      frameBytes: 50_000,
      frameCount: i * 30,
      frameSeq: i,
      captureToEncodeMs: 0,
      encodeToPublishMs: 0,
      deviceFrameAgeMs: 10,
      glassToGlassMs: 1,
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      recording: false,
      thermalGovernorCappedFps: 24,
      thermalGovernorCpuC: cpuC,
    },
    sysfsThermalCpuC: cpuC,
    cpu: { load: null, totalPercent: 40, labosCorePercent: 2, labosCameraPercent: 25, dashboardPercent: 0, adbdPercent: 0 },
    thermal: { cpuC, gpuC: cpuC, batteryC: 25, skinC: 22 + i * 0.05 },
    wifi: { rxBytes: 1000, txBytes: 2000 + i * 50000, rxBytesPerSec: 100, txBytesPerSec: 200000 },
  };
}

function main() {
  const hot = analyzeThermalGradient(
    Array.from({ length: 30 }, (_, i) => tick(i, 55 + i * 0.8, 450 + i * 5)),
    75,
  );
  assert.ok(hot.cpuC.rampRateCPerMin !== null && hot.cpuC.rampRateCPerMin > 0);
  assert.ok(hot.cpuC.max !== null && hot.cpuC.max > 70);
  assert.equal(hot.charging, true);

  const cool = analyzeThermalGradient(
    Array.from({ length: 30 }, (_, i) => tick(i, 50 + i * 0.1, 300)),
    75,
  );
  assert.ok((cool.cpuC.rampRateCPerMin ?? 999) < (hot.cpuC.rampRateCPerMin ?? 0));

  const ranked = rankThermalMitigations([
    { id: "hot", thermal: hot },
    { id: "cool", thermal: cool },
  ]);
  assert.equal(ranked[0]?.id, "cool");

  console.log("[thermal-gradient] all checks passed");
}

main();
