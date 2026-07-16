import assert from "node:assert/strict";
import { socFractionalPercent } from "../power/battery-granularity.js";
import { parsePipelineMetrics, summarizeTraceSeries, type SynchronizedTraceSample } from "../power/power-trace.js";

function makeSample(tick: number, atMs: number, chargeUah: number, coulombSlope: number | null): SynchronizedTraceSample {
  return {
    tick,
    tier: "full",
    at: new Date(atMs).toISOString(),
    atMs,
    syncSkewMs: 40,
    battery: {
      levelPercent: 100,
      socFractionalPercent: socFractionalPercent(chargeUah, 2_946_000),
      chargeCounterUah: chargeUah,
      chargeFullUah: 2_946_000,
      voltageMv: 4100,
      temperatureC: 25,
      status: 3,
      currentNowRaw: 1200,
      currentAvgRaw: 900,
      instantaneousMw: 492,
      coulombSlopeMw: coulombSlope,
      chargeDeltaUahSincePrior: coulombSlope !== null ? -200 : null,
    },
    pipeline: {
      streamFrameAgeMs: 2,
      fps: 28,
      frameBytes: 50_000,
      frameCount: 100 + tick,
      frameSeq: tick,
      captureToEncodeMs: 0,
      encodeToPublishMs: 1,
      deviceFrameAgeMs: 2,
      glassToGlassMs: 3,
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      recording: false,
      thermalGovernorCappedFps: 24,
      thermalGovernorCpuC: 55,
    },
    sysfsThermalCpuC: 55,
    cpu: null,
    thermal: null,
    wifi: { rxBytes: 1000, txBytes: 2000, rxBytesPerSec: 100, txBytesPerSec: 500 },
  };
}

function main() {
  assert.equal(socFractionalPercent(2_945_000, 2_946_000), 99.97);

  const metrics = parsePipelineMetrics({
    ok: true,
    streamFrameAgeMs: 4,
    fps: 30,
    lastCaptureToEncodeMs: 1,
    lastEncodeToPublishMs: 0,
    lastGlassToGlassMs: 2,
    encodeMode: "hardware-h264",
    transport: "h264-annexb-http",
    lastTrace: { frameSeq: 42, deviceFrameAgeMs: 3 },
  });
  assert.equal(metrics?.frameSeq, 42);
  assert.equal(metrics?.captureToEncodeMs, 1);

  const summary = summarizeTraceSeries([
    makeSample(0, 0, 2_946_000, null),
    makeSample(1, 2000, 2_945_800, 410),
    makeSample(2, 4000, 2_945_600, 410),
  ]);
  assert.equal(summary.ticks, 3);
  assert.equal(summary.soc.chargeDeltaUah, -400);
  assert.ok(summary.powerMw.instantaneous.avg !== null);
  assert.equal(summary.pipeline.fps.avg, 28);
  assert.ok(summary.spikes);

  console.log("[power-trace] all checks passed");
}

main();
