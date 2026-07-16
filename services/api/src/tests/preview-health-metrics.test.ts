import assert from "node:assert/strict";
import { PreviewFpsEstimator } from "../preview/health-metrics.js";
import {
  previewDiagnostic,
  kitchenCameraPowerProfileSettings,
  previewPortForwardPresent,
  previewReadyFromSignals,
} from "../preview/device-preview.js";

function main() {
  const estimator = new PreviewFpsEstimator();

  const first = estimator.update(
    { ok: true, fps: 0.2, frameCount: 100, streaming: true },
    { nowMs: 1_000 },
  );
  assert.equal(first.fpsSource, "device");
  assert.equal(first.fps, 0.2);

  const second = estimator.update(
    { ok: true, fps: 0.2, frameCount: 130, streaming: true },
    { nowMs: 3_000 },
  );
  assert.equal(second.fpsSource, "frame-delta");
  assert.equal(second.fps, 15);
  assert.equal(second.deviceFps, 0.2);

  const stalled = estimator.update(
    { ok: true, fps: 99, frameCount: 130, streaming: true },
    { nowMs: 5_000, bufferApproxFps: 11.4 },
  );
  assert.equal(stalled.fpsSource, "stream-buffer");
  assert.equal(stalled.fps, 11.4);

  const idle = estimator.update(
    { ok: true, fps: 14, frameCount: 140, streaming: false },
    { nowMs: 6_000 },
  );
  assert.equal(idle.fpsSource, "idle");
  assert.equal(idle.fps, 0);

  assert.equal(previewPortForwardPresent("192.168.50.122:5555 tcp:8089 tcp:8089"), true);
  assert.equal(previewPortForwardPresent("192.168.50.122:5555 tcp:8080 tcp:8080"), false);
  assert.equal(previewPortForwardPresent(""), false);

  assert.equal(previewReadyFromSignals({ frameReachable: true, streaming: false, frameCount: 0 }), true);
  assert.equal(previewReadyFromSignals({ frameReachable: false, streaming: true, frameCount: 2 }), true);
  assert.equal(previewReadyFromSignals({ frameReachable: false, streaming: true, frameCount: 0 }), false);

  assert.deepEqual(
    previewDiagnostic({ healthReachable: true, frameReachable: true, frameBytes: 2048 }).status,
    "ready",
  );
  assert.equal(
    previewDiagnostic({ healthReachable: false, healthError: "Empty reply from server" }).detail,
    "Preview server did not answer /health: Empty reply from server.",
  );
  assert.equal(
    previewDiagnostic({ healthReachable: true, streaming: false, frameCount: 0 }).status,
    "not_streaming",
  );
  assert.equal(
    previewDiagnostic({ healthReachable: true, streaming: true, frameCount: 0 }).status,
    "waiting_for_frames",
  );
  assert.equal(
    previewDiagnostic({
      healthReachable: true,
      streaming: true,
      frameCount: 3,
      frameReachable: false,
      frameError: "/frame HTTP 503",
    }).status,
    "ready",
  );

  assert.deepEqual(kitchenCameraPowerProfileSettings(), {
    video_width: 1280,
    video_height: 720,
    video_fps: 15,
    video_bitrate: 3_000_000,
    stream_width: 1280,
    stream_height: 720,
    stream_jpeg_quality: 45,
    stream_fps: 24,
    camera_keep_alive_ms: 60_000,
  });

  console.log("[preview-health-metrics] all checks passed");
}

main();
