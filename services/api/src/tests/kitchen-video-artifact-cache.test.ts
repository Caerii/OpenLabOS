import assert from "node:assert/strict";
import {
  cachedNativeVideoArtifactsForManifest,
  nativeVideoPathsForManifest,
} from "../ai/kitchen/video-artifact-cache.js";

async function main() {
  const manifest = {
    run: { id: "run-video-cache-test" },
    stepAttempts: [
      {
        nativeVideoPaths: [
          "/storage/emulated/0/LabOS/media/VID_1.mp4",
          "/tmp/not-labos.mp4",
        ],
      },
    ],
    stepSegments: [
      {
        nativeRecording: {
          lastVideoPath: "/sdcard/LabOS/media/VID_2.mp4",
        },
      },
    ],
  };

  const paths = nativeVideoPathsForManifest(manifest);
  assert.ok(paths.includes("/sdcard/LabOS/media/VID_1.mp4"));
  assert.ok(paths.includes("/sdcard/LabOS/media/VID_2.mp4"));
  assert.ok(paths.includes("/tmp/not-labos.mp4"));

  const artifacts = await cachedNativeVideoArtifactsForManifest(manifest);
  assert.equal(artifacts["/sdcard/LabOS/media/VID_1.mp4"].status, "missing");
  assert.equal(artifacts["/tmp/not-labos.mp4"].status, "error");
  assert.match(artifacts["/tmp/not-labos.mp4"].error || "", /LabOS media/);

  const sanitized = await cachedNativeVideoArtifactsForManifest({
    run: { id: "../bad/run" },
    stepAttempts: [{ nativeVideoPaths: ["/sdcard/LabOS/media/VID_3.mp4"] }],
  });
  assert.equal(sanitized["/sdcard/LabOS/media/VID_3.mp4"].status, "missing");
  assert.match(sanitized["/sdcard/LabOS/media/VID_3.mp4"].ref, /^kitchen\/native-videos\/___bad_run\//);

  console.log("[kitchen-video-artifact-cache] all checks passed");
}

await main();
