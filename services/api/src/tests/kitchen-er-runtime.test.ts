import assert from "node:assert/strict";
import { ER_THINKING } from "../ai/er-utils.js";
import {
  buildGoogleVideoGenerateContentRequest,
  extractEROptions,
  hasBeforeAfterInputs,
  hasVideoChunkMetadata,
} from "../ai/kitchen/er-runtime.js";

function testVideoMetadataDetection() {
  assert.equal(hasVideoChunkMetadata({}), false);
  assert.equal(hasVideoChunkMetadata({ videoStartOffsetSec: 1 }), true);
  assert.equal(hasVideoChunkMetadata({ videoEndOffsetSec: 2 }), true);
  assert.equal(hasVideoChunkMetadata({ videoFps: 4 }), true);
  assert.equal(hasVideoChunkMetadata({ videoFilePath: "chunk.mp4" }), true);
}

function testBeforeAfterInputDetection() {
  assert.equal(hasBeforeAfterInputs({}), false);
  assert.equal(hasBeforeAfterInputs({ beforeImageUrl: "https://example.com/before.jpg" }), false);
  assert.equal(
    hasBeforeAfterInputs({
      beforeFrameBuffer: Buffer.from("before"),
      afterFrameBuffer: Buffer.from("after"),
    }),
    true,
  );

  const opts = extractEROptions({
    beforeImage: Buffer.from("before").toString("base64"),
    afterImage: Buffer.from("after").toString("base64"),
  });
  assert.equal(opts.beforeFrameBuffer?.toString("utf-8"), "before");
  assert.equal(opts.afterFrameBuffer?.toString("utf-8"), "after");
  assert.equal(hasBeforeAfterInputs(opts), true);
}

function testGoogleVideoRequestBuilder() {
  const mode = {
    id: "teacher-judgment",
    name: "Teacher Judgment",
    prompt: "Judge this clip.",
    systemInstruction: "Output JSON only.",
    outputType: "json" as const,
    thinkingBudget: ER_THINKING.FAST,
  };

  const request = buildGoogleVideoGenerateContentRequest(mode, {
    videoUrl: "https://youtu.be/abc123",
    videoStartOffsetSec: 12,
    videoEndOffsetSec: 18,
    videoFps: 3,
  });
  const videoPart = request.contents[0]?.parts[0] as {
    fileData: { fileUri: string; mimeType: string };
    videoMetadata: { startOffset: string; endOffset: string; fps: number };
  };
  const textPart = request.contents[0]?.parts[1] as { text: string };

  assert.equal(request.systemInstruction?.parts[0]?.text, "Output JSON only.");
  assert.equal(videoPart.fileData.fileUri, "https://youtu.be/abc123");
  assert.equal(videoPart.videoMetadata.startOffset, "12s");
  assert.equal(videoPart.videoMetadata.endOffset, "18s");
  assert.equal(videoPart.videoMetadata.fps, 3);
  assert.equal(textPart.text, "Judge this clip.");
}

function testGoogleVideoRequestBuilderRejectsBackwardsWindow() {
  const mode = {
    id: "teacher-judgment",
    name: "Teacher Judgment",
    prompt: "Judge this clip.",
    outputType: "json" as const,
    thinkingBudget: ER_THINKING.FAST,
  };

  assert.throws(
    () =>
      buildGoogleVideoGenerateContentRequest(mode, {
        videoUrl: "https://youtu.be/abc123",
        videoStartOffsetSec: 18,
        videoEndOffsetSec: 12,
      }),
    /videoEndOffsetSec must be greater/i,
  );
}

function testGoogleVideoRequestBuilderAcceptsUploadedUriOverride() {
  const mode = {
    id: "teacher-judgment",
    name: "Teacher Judgment",
    prompt: "Judge this clip.",
    outputType: "json" as const,
    thinkingBudget: ER_THINKING.FAST,
  };
  const request = buildGoogleVideoGenerateContentRequest(
    mode,
    { videoFilePath: "local.mp4", videoMimeType: "video/mp4", videoFps: 2 },
    "https://generativelanguage.googleapis.com/v1beta/files/uploaded",
  );
  const videoPart = request.contents[0]?.parts[0] as {
    fileData: { fileUri: string; mimeType: string };
    videoMetadata: { fps: number };
  };
  assert.equal(videoPart.fileData.fileUri, "https://generativelanguage.googleapis.com/v1beta/files/uploaded");
  assert.equal(videoPart.fileData.mimeType, "video/mp4");
  assert.equal(videoPart.videoMetadata.fps, 2);
}

function main() {
  testVideoMetadataDetection();
  testBeforeAfterInputDetection();
  testGoogleVideoRequestBuilder();
  testGoogleVideoRequestBuilderRejectsBackwardsWindow();
  testGoogleVideoRequestBuilderAcceptsUploadedUriOverride();
  console.log("[kitchen-er-runtime] all checks passed");
}

main();
