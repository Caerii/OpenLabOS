import { describe, expect, it } from "vitest";
import {
  MJPEG_CAPTURE_ENCODE_HEADER,
  MJPEG_ENCODE_PUBLISH_HEADER,
  MJPEG_FRAME_SEQ_HEADER,
  MJPEG_FRAME_TIME_HEADER,
} from "../src/metrics/pipeline-stages.js";
import { buildMinimalMjpegChunk } from "../src/wire/mjpeg-encoder.js";
import {
  MjpegLastFrameExtractor,
  getLastStreamFrameMeta,
  getRecentStreamJpegIfFresh,
  getStreamFrameAgeMs,
  resetPreviewStreamTapForTests,
  tapPreviewStreamChunk,
} from "../src/wire/mjpeg-tap.js";

describe("MJPEG wire parser", () => {
  it("extracts a JPEG from a minimal multipart chunk", () => {
    resetPreviewStreamTapForTests();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    tapPreviewStreamChunk(Buffer.from(buildMinimalMjpegChunk(jpeg)));
    expect(getRecentStreamJpegIfFresh(4500)?.length).toBe(jpeg.length);
    expect(getStreamFrameAgeMs()).not.toBeNull();
  });

  it("parses LabOS timing headers from multipart chunks", () => {
    resetPreviewStreamTapForTests();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const publishedAt = Date.now() - 25;
    tapPreviewStreamChunk(
      Buffer.from(
        buildMinimalMjpegChunk(jpeg, {
          [MJPEG_FRAME_TIME_HEADER]: publishedAt,
          [MJPEG_FRAME_SEQ_HEADER]: 7,
          [MJPEG_CAPTURE_ENCODE_HEADER]: 12,
          [MJPEG_ENCODE_PUBLISH_HEADER]: 3,
        }),
      ),
    );
    const meta = getLastStreamFrameMeta();
    expect(meta.frameSeq).toBe(7);
    expect(meta.captureToEncodeMs).toBe(12);
    expect(meta.encodeToPublishMs).toBe(3);
    expect(meta.hostIngestMs).toBeGreaterThanOrEqual(20);
    expect(meta.glassToGlassMs).toBeGreaterThanOrEqual(35);
  });

  it("reassembles split chunks", () => {
    resetPreviewStreamTapForTests();
    const jpeg = Buffer.alloc(256, 0xab);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    const chunk = Buffer.from(buildMinimalMjpegChunk(jpeg));
    const splitAt = Math.floor(chunk.length / 2);
    const extractor = new MjpegLastFrameExtractor();
    extractor.push(chunk.subarray(0, splitAt));
    extractor.push(chunk.subarray(splitAt));
    tapPreviewStreamChunk(chunk);
    expect(getRecentStreamJpegIfFresh(4500)?.length).toBe(jpeg.length);
  });
});
