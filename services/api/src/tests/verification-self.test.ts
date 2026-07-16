/**
 * Self-tests for kitchen verification pipeline pieces (no device, no API keys).
 * Run: pnpm test
 */
import assert from "node:assert/strict";
import {
  getRecentStreamJpegIfFresh,
  resetPreviewStreamTapForTests,
  tapPreviewStreamChunk,
} from "../preview/mjpeg-last-frame.js";
import { previewFrameBuffer } from "../preview/rolling-frame-buffer.js";
import {
  ProtocolTracker,
  KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE,
} from "../ai/kitchen/tracker.js";

function buildMjpegPart(jpegBody: Buffer): Buffer {
  const head = Buffer.from(
    `--labos-frame-boundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegBody.length}\r\n\r\n`,
    "utf8",
  );
  return Buffer.concat([head, jpegBody, Buffer.from("\r\n")]);
}

function testMjpegTapSinglePart() {
  resetPreviewStreamTapForTests();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  tapPreviewStreamChunk(buildMjpegPart(jpeg));
  const got = getRecentStreamJpegIfFresh(5000);
  assert.ok(got);
  assert.deepEqual(Buffer.from(got), jpeg);
}

function testMjpegTapLatestWins() {
  resetPreviewStreamTapForTests();
  const first = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const second = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xd9]);
  tapPreviewStreamChunk(buildMjpegPart(first));
  tapPreviewStreamChunk(buildMjpegPart(second));
  assert.deepEqual(Buffer.from(getRecentStreamJpegIfFresh(5000)!), second);
}

function testMjpegTapFeedsRollingBuffer() {
  resetPreviewStreamTapForTests();
  const first = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const second = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xd9]);
  tapPreviewStreamChunk(buildMjpegPart(first));
  tapPreviewStreamChunk(buildMjpegPart(second));
  const stats = previewFrameBuffer.stats();
  assert.equal(stats.frameCount, 2);
  const window = previewFrameBuffer.selectWindow({ windowMs: 5000, fps: 2 });
  assert.ok(window.frames.length >= 1);
  assert.deepEqual(Buffer.from(window.frames.at(-1)!.jpeg), second);
}

function testMjpegTapSplitChunks() {
  resetPreviewStreamTapForTests();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const part = buildMjpegPart(jpeg);
  const mid = Math.max(1, Math.floor(part.length / 2));
  tapPreviewStreamChunk(part.subarray(0, mid));
  tapPreviewStreamChunk(part.subarray(mid));
  assert.deepEqual(Buffer.from(getRecentStreamJpegIfFresh(5000)!), jpeg);
}

async function testMjpegTapStale() {
  resetPreviewStreamTapForTests();
  tapPreviewStreamChunk(buildMjpegPart(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));
  assert.ok(getRecentStreamJpegIfFresh(5000));
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(getRecentStreamJpegIfFresh(10), null, "older than maxAgeMs must not return");
}

/** Matches tracker + API `stepAdvanced` (same threshold constant). */
function testTrackerVerificationGate() {
  const t = new ProtocolTracker();
  t.startRun("kitchen-tea-v1");
  t.forceStart();

  assert.equal(t.getCurrentStep()?.step.number, 1);

  const base = { timestamp: Date.now(), reasoning: "x", rawResponse: {} as any };

  t.recordVerification({ ...base, success: false, confidence: 1 });
  assert.equal(t.getCurrentStep()?.step.number, 1, "fail must not advance");

  t.recordVerification({
    ...base,
    success: true,
    confidence: Math.max(0, KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE - 0.01),
  });
  assert.equal(t.getCurrentStep()?.step.number, 1, "just below threshold must not advance");

  t.recordVerification({ ...base, success: true, confidence: KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE });
  assert.equal(t.getCurrentStep()?.step.number, 2, "at threshold advances");

  t.recordVerification({ ...base, success: false, confidence: 1 });
  assert.equal(t.getCurrentStep()?.step.number, 2, "fail on step 2 stays on 2");
}

function testTrackerManualCompleteBypasses() {
  const t = new ProtocolTracker();
  t.startRun("kitchen-tea-v1");
  t.forceStart();
  t.recordVerification({ timestamp: Date.now(), success: false, confidence: 1, reasoning: "", rawResponse: {} });
  assert.equal(t.getCurrentStep()?.step.number, 1);
  t.manualComplete();
  assert.equal(t.getCurrentStep()?.step.number, 2);
}

async function main() {
  testMjpegTapSinglePart();
  testMjpegTapLatestWins();
  testMjpegTapFeedsRollingBuffer();
  testMjpegTapSplitChunks();
  await testMjpegTapStale();
  testTrackerVerificationGate();
  testTrackerManualCompleteBypasses();
  console.log("[verification-self] all checks passed");
}

void main();
