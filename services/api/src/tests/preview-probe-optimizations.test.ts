import assert from "node:assert/strict";
import { resetPreviewPortForwardCacheForTests } from "../preview/device-preview.js";
import {
  getRecentStreamJpegIfFresh,
  getStreamFrameAgeMs,
  resetPreviewStreamTapForTests,
  tapPreviewStreamChunk,
} from "../preview/mjpeg-last-frame.js";

function buildMinimalMjpegChunk(jpeg: Buffer) {
  const header = Buffer.from(
    `--labos-frame-boundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`,
    "latin1",
  );
  return Buffer.concat([header, jpeg, Buffer.from("\r\n", "latin1")]);
}

function main() {
  resetPreviewStreamTapForTests();

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  tapPreviewStreamChunk(buildMinimalMjpegChunk(jpeg));

  assert.ok(getStreamFrameAgeMs() !== null);
  assert.equal(getRecentStreamJpegIfFresh(4500)?.length, jpeg.length);

  resetPreviewPortForwardCacheForTests();
  console.log("[preview-probe-optimizations] all checks passed");
}

main();
