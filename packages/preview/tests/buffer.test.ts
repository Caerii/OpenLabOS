import { describe, expect, it } from "vitest";
import { RollingPreviewFrameBuffer } from "../src/buffer/rolling-frame-buffer.js";
import { computeGlassToGlassMs, pickDisplayedLatencyMs } from "../src/metrics/latency.js";

describe("preview buffer and metrics", () => {
  it("selects rolling window frames", () => {
    const buffer = new RollingPreviewFrameBuffer(10_000, 100, 1024 * 1024);
    const now = 10_000;
    buffer.push(Buffer.from([1, 2, 3]), now - 500);
    buffer.push(Buffer.from([4, 5, 6]), now - 250);
    buffer.push(Buffer.from([7, 8, 9]), now);
    const window = buffer.selectWindow({ windowMs: 1000, fps: 4, now });
    expect(window.frames.length).toBeGreaterThan(0);
    expect(buffer.stats(now).frameCount).toBe(3);
  });

  it("computes glass-to-glass latency breakdown", () => {
    const total = computeGlassToGlassMs({
      captureToEncodeMs: 12,
      encodeToPublishMs: 8,
      publishToClientMs: 20,
      streamFrameAgeMs: 40,
      glassToGlassMs: null,
    });
    expect(total).toBe(40);
  });

  it("prefers stream frame age for display", () => {
    expect(pickDisplayedLatencyMs({ streamFrameAgeMs: 28, encodeLatencyMs: 140 })).toBe(28);
  });
});
