import assert from "node:assert/strict";
import {
  parseBatteryDump,
  parseCpuInfo,
  parseThermalDump,
  summarizePowerSamples,
  type PowerSample,
} from "../power/power-profiler.js";

type PowerSampleOverrides = Omit<Partial<PowerSample>, "battery" | "cpu" | "thermal" | "wifi" | "preview"> & {
  battery?: Partial<PowerSample["battery"]>;
  cpu?: Partial<PowerSample["cpu"]>;
  thermal?: Partial<PowerSample["thermal"]>;
  wifi?: Partial<PowerSample["wifi"]>;
  preview?: Partial<NonNullable<PowerSample["preview"]>>;
};

function sample(overrides: PowerSampleOverrides): PowerSample {
  return {
    at: new Date(overrides.atMs || 0).toISOString(),
    atMs: overrides.atMs || 0,
    battery: {
      level: 50,
      voltageMv: 4000,
      temperatureC: 25,
      chargeCounterUah: 100_000,
      status: 3,
      currentNowRaw: -1500,
      currentAvgRaw: 1200,
      ...overrides.battery,
    },
    cpu: {
      load: null,
      totalPercent: 10,
      labosCorePercent: 2,
      labosCameraPercent: 3,
      dashboardPercent: 1,
      adbdPercent: 1,
      ...overrides.cpu,
    },
    thermal: {
      cpuC: 45,
      gpuC: 45,
      batteryC: 25,
      skinC: 24,
      ...overrides.thermal,
    },
    wifi: {
      rxBytes: 1_000,
      txBytes: 2_000,
      ...overrides.wifi,
    },
    preview: {
      ok: true,
      streaming: true,
      recording: true,
      frameCount: 10,
      fps: 6,
      frameBytes: 20_000,
      ...overrides.preview,
    },
  };
}

function main() {
  assert.deepEqual(parseBatteryDump([
    "Current Battery Service state:",
    "  Charge counter: 29460",
    "  status: 3",
    "  level: 1",
    "  voltage: 4155",
    "  temperature: 249",
  ].join("\n")), {
    level: 1,
    voltageMv: 4155,
    temperatureC: 24.9,
    chargeCounterUah: 29460,
    status: 3,
  });

  assert.deepEqual(parseCpuInfo([
    "Load: 10.42 / 10.36 / 7.6",
    "  2.4% 1301/com.openlab.labos.core: 1.8% user + 0.5% kernel",
    "  1.7% 1901/com.openlab.labos.camera: 1.3% user + 0.4% kernel",
    "  0.2% 1688/com.openlab.labos.dashboard: 0.2% user + 0% kernel",
    "  3.1% 507/adbd: 0.4% user + 2.7% kernel",
    "10% TOTAL: 4.3% user + 5.4% kernel",
  ].join("\n")), {
    load: "10.42 / 10.36 / 7.6",
    totalPercent: 10,
    labosCorePercent: 2.4,
    labosCameraPercent: 1.7,
    dashboardPercent: 0.2,
    adbdPercent: 3.1,
  });

  assert.deepEqual(parseThermalDump([
    "Current temperatures from HAL:",
    "  Temperature{mValue=49.0, mType=0, mName=CPU, mStatus=0}",
    "  Temperature{mValue=49.0, mType=1, mName=GPU, mStatus=0}",
    "  Temperature{mValue=24.9, mType=2, mName=BATTERY, mStatus=0}",
    "  Temperature{mValue=20.0, mType=3, mName=SKIN, mStatus=0}",
  ].join("\n")), {
    cpuC: 49,
    gpuC: 49,
    batteryC: 24.9,
    skinC: 20,
  });

  const summary = summarizePowerSamples("balanced", [
    sample({ atMs: 0 }),
    sample({
      atMs: 60_000,
      battery: { level: 49, chargeCounterUah: 98_000 },
      wifi: { rxBytes: 61_000, txBytes: 32_000 },
      preview: { frameCount: 370, frameBytes: 18_000 },
      cpu: { totalPercent: 12, labosCameraPercent: 4 },
      thermal: { cpuC: 47 },
    }),
  ]);
  assert.equal(summary.durationSec, 60);
  assert.equal(summary.batteryDeltaPercent, -1);
  assert.equal(summary.chargeDeltaUah, -2000);
  assert.equal(Math.round(summary.estimatedAverageCurrentMa || 0), 120);
  assert.equal(summary.wifiBytesPerSec, 1500);
  assert.equal(summary.previewFrameDelta, 360);
  assert.equal(summary.avgCpuPercent, 11);
  assert.equal(summary.maxCpuTempC, 47);
  assert.ok(summary.measuredTotalMw !== null && summary.measuredTotalMw > 400);

  console.log("[power-profiler] all checks passed");
}

main();
