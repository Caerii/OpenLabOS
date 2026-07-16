import assert from "node:assert/strict";
import {
  buildKitchenCaptureReadiness,
  ensureKitchenCaptureReadiness,
} from "../ai/kitchen/capture-readiness.js";

function main() {
  const readiness = buildKitchenCaptureReadiness({
    run: { status: "completed", metrics: { stepsCompleted: 2 } },
    steps: [{}, {}],
    stepSegments: [
      { stepNumber: 1, nativeRecording: { lastVideoPath: "/sdcard/LabOS/media/step-1.mp4" } },
      { stepNumber: 2, nativeRecording: { lastVideoPath: "/sdcard/LabOS/media/step-2.mp4" } },
    ],
    frames: [{}, {}],
    chunks: [],
    stepAnalyses: [],
  });
  assert.equal(readiness.schemaVersion, "labos.kitchen.capture-readiness.v2");
  assert.equal(readiness.grade, "simple_demo_ready");
  assert.ok(readiness.checks.some((check) => check.id === "async_analysis" && check.status === "fail"));

  const missingNativeVideos = buildKitchenCaptureReadiness({
    run: { status: "completed", metrics: { stepsCompleted: 2 } },
    steps: [{}, {}],
    stepSegments: [{ stepNumber: 1 }, { stepNumber: 2 }],
    frames: [{}, {}],
    chunks: [],
    stepAnalyses: [],
  });
  assert.equal(missingNativeVideos.grade, "not_ready");
  assert.equal(missingNativeVideos.checks.find((check) => check.id === "native_videos")?.status, "fail");

  const enriched = ensureKitchenCaptureReadiness({
    run: { status: "completed", metrics: { stepsCompleted: 1 } },
    steps: [{}],
    stepSegments: [{ stepNumber: 1, nativeRecording: { lastVideoPath: "/sdcard/LabOS/media/step-1.mp4" } }],
    frames: [{}],
    chunks: [],
  });
  assert.equal(enriched.readiness.grade, "simple_demo_ready");
  assert.deepEqual(enriched.stepAnalyses, []);

  console.log("[kitchen-capture-readiness] all checks passed");
}

main();
