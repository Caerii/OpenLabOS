import { describe, expect, it } from "vitest";
import { previewDiagnostic, previewPortForwardPresent, previewReadyFromSignals } from "../src/health/diagnostic.js";
import { PreviewFpsEstimator } from "../src/health/fps-estimator.js";
import { parsePreviewHealth } from "../src/health/schema.js";

describe("preview health", () => {
  it("parses extended health payload", () => {
    const health = parsePreviewHealth({
      ok: true,
      streaming: true,
      fps: 12,
      frameCount: 42,
      streamFrameAgeMs: 33,
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
    });
    expect(health.streamFrameAgeMs).toBe(33);
    expect(health.encodeMode).toBe("hardware-h264");
  });

  it("computes diagnostics", () => {
    expect(previewReadyFromSignals({ frameReachable: true, streaming: false, frameCount: 0 })).toBe(true);
    expect(previewDiagnostic({ healthReachable: false, healthError: "timeout" }).status).toBe(
      "server_unreachable",
    );
  });

  it("estimates fps from frame deltas", () => {
    const estimator = new PreviewFpsEstimator();
    estimator.update({ ok: true, fps: 0, frameCount: 0, streaming: true }, { nowMs: 0 });
    const second = estimator.update(
      { ok: true, fps: 0, frameCount: 15, streaming: true },
      { nowMs: 1000 },
    );
    expect(second.fpsSource).toBe("frame-delta");
    expect(second.fps).toBe(15);
  });

  it("detects adb forward entries", () => {
    expect(previewPortForwardPresent("device tcp:8089 tcp:8089")).toBe(true);
    expect(previewPortForwardPresent("device tcp:8080 tcp:8080")).toBe(false);
  });
});
