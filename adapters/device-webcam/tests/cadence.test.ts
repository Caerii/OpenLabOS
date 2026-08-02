import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebcamDeviceAdapter } from "../src/index.js";

describe("WebcamDeviceAdapter cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces frames at the requested cadence (±10%)", async () => {
    const fps = 10;
    const sleepMs: number[] = [];
    const adapter = new WebcamDeviceAdapter({
      id: "webcam@test",
      fps,
      sleep: async (ms) => {
        sleepMs.push(ms);
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    const session = await adapter.open({ sessionId: "s1", request: ["camera"] });
    const iterator = session.preview()[Symbol.asyncIterator]();

    for (let i = 0; i < 6; i++) {
      const next = iterator.next();
      await vi.runOnlyPendingTimersAsync();
      const { value } = await next;
      expect(value).toBeDefined();
      expect(value!.seq).toBe(i);
      expect(value!.bytes.byteLength).toBeGreaterThan(0);
    }

    await session.close();

    const expectedMs = 1000 / fps;
    const tolerance = expectedMs * 0.1;
    expect(sleepMs).toHaveLength(5);
    for (const interval of sleepMs) {
      expect(interval).toBeGreaterThanOrEqual(expectedMs - tolerance);
      expect(interval).toBeLessThanOrEqual(expectedMs + tolerance);
    }
  });
});
