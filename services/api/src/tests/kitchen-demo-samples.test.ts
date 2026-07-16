import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listKitchenDemoSamples, resolveKitchenDemoSampleAsset } from "../ai/kitchen/demo-samples.js";

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "labos-demo-samples-"));
  const manifest = path.join(tmp, "samples.jsonl");
  const sourcesManifest = path.join(tmp, "sources.jsonl");
  const framesManifest = path.join(tmp, "frames.jsonl");
  const clipPath = path.join(tmp, "clip.mp4");
  const framePath = path.join(tmp, "frame.jpg");
  await fs.writeFile(clipPath, "clip");
  await fs.writeFile(framePath, "frame");
  await fs.writeFile(
    sourcesManifest,
    JSON.stringify({
      source_id: "src-1",
      source: "youtube_pov",
      title: "Tea tutorial",
      uploader: "Tester",
      url: "https://www.youtube.com/watch?v=abc123",
      protocol_id: "kitchen-tea-v1",
      recipe: "tea",
      step_hint: "pour-water-into-mug",
      label_hint: "pour visible",
      split: "smoke",
      notes: "normalized source row",
    }) + "\n",
    "utf-8",
  );
  await fs.writeFile(
    manifest,
    JSON.stringify({
      sample_id: "sample-1",
      source_id: "src-1",
      clip_path: clipPath,
      clip_start_ms: 1500,
      clip_end_ms: 3000,
      clip_duration_seconds: 1.5,
      target_fps: 2,
      frame_count: 3,
    }) + "\n",
    "utf-8",
  );
  await fs.writeFile(
    framesManifest,
    JSON.stringify({
      frame_id: "sample-1__frame0000",
      sample_id: "sample-1",
      source_id: "src-1",
      frame_index: 0,
      image_path: framePath,
      timestamp_ms: 1500,
    }) + "\n",
    "utf-8",
  );

  const prev = process.env.KITCHEN_DEMO_SAMPLES_MANIFEST;
  process.env.KITCHEN_DEMO_SAMPLES_MANIFEST = manifest;
  try {
    const result = await listKitchenDemoSamples();
    assert.equal(result.configured, true);
    assert.equal(result.samples.length, 1);
    assert.equal(result.samples[0].sampleId, "sample-1");
    assert.equal(result.samples[0].title, "Tea tutorial");
    assert.equal(result.samples[0].stepHint, "pour-water-into-mug");
    assert.equal(result.samples[0].clipStartSec, 1.5);
    assert.equal(result.samples[0].clipEndSec, 3);
    assert.equal(result.samples[0].videoUrl, "https://www.youtube.com/watch?v=abc123");
    assert.equal(result.samples[0].previewVideoUrl, "/api/kitchen/demo/samples/sample-1/clip");
    assert.deepEqual(result.samples[0].frameUrls, ["/api/kitchen/demo/samples/sample-1/frames/0"]);
    assert.equal(await resolveKitchenDemoSampleAsset("sample-1", { type: "clip" }), clipPath);
    assert.equal(await resolveKitchenDemoSampleAsset("sample-1", { type: "frame", index: 0 }), framePath);
  } finally {
    if (prev === undefined) {
      delete process.env.KITCHEN_DEMO_SAMPLES_MANIFEST;
    } else {
      process.env.KITCHEN_DEMO_SAMPLES_MANIFEST = prev;
    }
  }

  console.log("[kitchen-demo-samples] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
