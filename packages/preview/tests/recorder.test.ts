import { describe, expect, it } from "vitest";
import { RollingLatencyRecorder } from "../src/metrics/recorder.js";

describe("RollingLatencyRecorder", () => {
  it("tracks p50/p95 per stage from traces", () => {
    const recorder = new RollingLatencyRecorder(32);
    for (let i = 1; i <= 20; i++) {
      recorder.recordTrace({
        recordedAtMs: Date.now(),
        captureToEncodeMs: i,
        encodeToPublishMs: i * 2,
        hostIngestMs: 10,
      });
    }

    const capture = recorder.stageStats("captureToEncode");
    expect(capture.samples).toBe(20);
    expect(capture.p50Ms).toBe(10);
    expect(capture.p95Ms).toBe(19);
    expect(capture.avgMs).toBe(11);

    const publish = recorder.stageStats("encodeToPublish");
    expect(publish.p50Ms).toBe(20);
    expect(publish.maxMs).toBe(40);
  });

  it("ignores invalid samples", () => {
    const recorder = new RollingLatencyRecorder();
    recorder.recordStage("hostHealthRtt", -1);
    recorder.recordStage("hostHealthRtt", Number.NaN);
    expect(recorder.stageStats("hostHealthRtt").samples).toBe(0);
  });

  it("resets buckets and traces", () => {
    const recorder = new RollingLatencyRecorder();
    recorder.recordTrace({ recordedAtMs: 1, glassToGlassMs: 42 });
    recorder.reset();
    expect(recorder.stageStats("glassToGlass").samples).toBe(0);
    expect(recorder.snapshot().lastTrace).toBeNull();
  });
});
