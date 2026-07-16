import assert from "node:assert/strict";
import { resolveRecordStreamProfile, RECORD_STREAM_PROFILES } from "@openlabos/preview";
import { analyzeTraceSpikes } from "../power/spike-analysis.js";
import type { SynchronizedTraceSample } from "../power/power-trace.js";

function main() {
  const sustained = resolveRecordStreamProfile("recordAndStreamSustained");
  assert.ok(sustained);
  assert.equal(sustained!.video.video_fps, 15);
  assert.equal(sustained!.config.fps, RECORD_STREAM_PROFILES.recordAndStreamSustained.config.fps);

  const samples: SynchronizedTraceSample[] = Array.from({ length: 20 }, (_, i) => ({
    tick: i,
    tier: i % 5 === 0 ? "full" : "fast",
    at: new Date(i * 100).toISOString(),
    atMs: i * 100,
    syncSkewMs: 5,
    battery: {
      levelPercent: 100,
      socFractionalPercent: 100,
      chargeCounterUah: 2_946_000,
      chargeFullUah: 2_946_000,
      voltageMv: 3800,
      temperatureC: 25,
      status: 3,
      currentNowRaw: i === 10 ? 5000 : 800,
      currentAvgRaw: 800,
      instantaneousMw: i === 10 ? 2000 : 300,
      coulombSlopeMw: null,
      chargeDeltaUahSincePrior: null,
    },
    pipeline: null,
    sysfsThermalCpuC: 50 + i * 0.1,
    cpu: null,
    thermal: null,
    wifi: { rxBytes: null, txBytes: null, rxBytesPerSec: null, txBytesPerSec: null },
  }));

  const spikes = analyzeTraceSpikes(samples);
  assert.equal(spikes.fastTicks, 16);
  assert.equal(spikes.fullTicks, 4);
  assert.ok(spikes.instantaneousMw.spikeCount >= 1);
  assert.ok((spikes.instantaneousMw.maxMw ?? 0) >= 2000);

  console.log("[record-stream-spike] all checks passed");
}

main();
