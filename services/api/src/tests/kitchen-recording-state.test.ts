import assert from "node:assert/strict";
import {
  compactNativeRecordingStatus,
  nativeRecordingActive,
  stoppedNativeRecordingStatus,
} from "../ai/kitchen/application/recording-state.js";

function main() {
  const active = compactNativeRecordingStatus({
    state: {
      active: true,
      activeVideoPath: "/media/current.mp4",
      startedAt: "2026-04-30T12:00:00.000Z",
    },
    health: {
      recording: true,
      activeVideoPath: "/media/health-current.mp4",
    },
  });
  assert.equal(active.active, true);
  assert.equal(active.activeVideoPath, "/media/current.mp4");
  assert.equal(active.healthRecording, true);
  assert.equal(nativeRecordingActive({ health: { recording: true } }), true);
  assert.equal(nativeRecordingActive({ state: { active: false }, health: { recording: false } }), false);

  const stoppedFromAfter = stoppedNativeRecordingStatus(null, {
    state: {
      active: false,
      lastVideoPath: "/media/after-last.mp4",
      stoppedAt: "2026-04-30T12:00:10.000Z",
    },
    health: { recording: false },
  });
  assert.equal(stoppedFromAfter.active, false);
  assert.equal(stoppedFromAfter.activeVideoPath, undefined);
  assert.equal(stoppedFromAfter.lastVideoPath, "/media/after-last.mp4");
  assert.equal(stoppedFromAfter.stoppedAt, "2026-04-30T12:00:10.000Z");

  const stoppedFromBeforeActive = stoppedNativeRecordingStatus({
    state: {
      active: true,
      activeVideoPath: "/media/before-active.mp4",
      startedAt: "2026-04-30T12:00:00.000Z",
    },
  }, {
    state: {
      active: false,
      stoppedAt: "2026-04-30T12:00:05.000Z",
    },
    health: { recording: false },
  });
  assert.equal(stoppedFromBeforeActive.active, false);
  assert.equal(stoppedFromBeforeActive.lastVideoPath, "/media/before-active.mp4");
  assert.equal(stoppedFromBeforeActive.startedAt, "2026-04-30T12:00:00.000Z");
  assert.equal(stoppedFromBeforeActive.stoppedAt, "2026-04-30T12:00:05.000Z");

  const healthFallback = stoppedNativeRecordingStatus({
    health: {
      activeVideoPath: "/media/health-active.mp4",
      recording: true,
    },
  }, {
    health: {
      recording: false,
      lastVideoPath: "/media/health-last.mp4",
    },
  });
  assert.equal(healthFallback.lastVideoPath, "/media/health-last.mp4");
  assert.equal(healthFallback.healthRecording, false);

  console.log("[kitchen-recording-state] all checks passed");
}

main();
