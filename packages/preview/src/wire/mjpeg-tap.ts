import {
  MJPEG_CAPTURE_ENCODE_HEADER,
  MJPEG_ENCODE_PUBLISH_HEADER,
  MJPEG_FRAME_SEQ_HEADER,
  MJPEG_FRAME_TIME_HEADER,
  type PreviewFrameTrace,
} from "../metrics/pipeline-stages.js";
import { RollingPreviewFrameBuffer } from "../buffer/rolling-frame-buffer.js";

const BOUNDARY = Buffer.from(`--labos-frame-boundary\r\n`);

let lastJpeg: Buffer | null = null;
let lastJpegAt = 0;
let lastFrameMeta: Partial<PreviewFrameTrace> = {};
let sharedBuffer: RollingPreviewFrameBuffer | null = null;

function buffer() {
  if (!sharedBuffer) sharedBuffer = new RollingPreviewFrameBuffer();
  return sharedBuffer;
}

export function getRecentStreamJpegIfFresh(maxAgeMs: number): Buffer | null {
  if (!lastJpeg || Date.now() - lastJpegAt > maxAgeMs) return null;
  return lastJpeg;
}

export function getStreamFrameAgeMs(): number | null {
  if (!lastJpegAt) return null;
  return Math.max(0, Date.now() - lastJpegAt);
}

export function getLastStreamFrameMeta(): Partial<PreviewFrameTrace> {
  return { ...lastFrameMeta };
}

function parseHeaderInt(header: string, name: string): number | null {
  const match = new RegExp(`^${name}:\\s*(\\d+)`, "im").exec(header);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseFrameHeaders(header: string): Partial<PreviewFrameTrace> {
  const publishedAtMs = parseHeaderInt(header, MJPEG_FRAME_TIME_HEADER);
  const captureToEncodeMs = parseHeaderInt(header, MJPEG_CAPTURE_ENCODE_HEADER);
  const encodeToPublishMs = parseHeaderInt(header, MJPEG_ENCODE_PUBLISH_HEADER);
  const frameSeq = parseHeaderInt(header, MJPEG_FRAME_SEQ_HEADER);
  const hostIngestMs =
    publishedAtMs && publishedAtMs > 0 ? Math.max(0, Date.now() - publishedAtMs) : null;
  return {
    frameSeq: frameSeq ?? undefined,
    publishedAtMs: publishedAtMs ?? undefined,
    captureToEncodeMs,
    encodeToPublishMs,
    deviceFrameAgeMs: hostIngestMs,
    hostIngestMs,
    glassToGlassMs:
      captureToEncodeMs !== null && encodeToPublishMs !== null && hostIngestMs !== null
        ? captureToEncodeMs + encodeToPublishMs + hostIngestMs
        : hostIngestMs,
    recordedAtMs: Date.now(),
  };
}

type ParseState = "seek_boundary" | "read_header" | "read_body";

export class MjpegLastFrameExtractor {
  private buf = Buffer.alloc(0);
  private state: ParseState = "seek_boundary";
  private bodyRemaining = 0;
  private readonly maxBuf = 4 * 1024 * 1024;

  push(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > this.maxBuf) {
      this.buf = this.buf.subarray(this.buf.length - this.maxBuf);
    }
    this.drain();
  }

  private drain() {
    for (;;) {
      if (this.state === "seek_boundary") {
        const i = this.buf.indexOf(BOUNDARY);
        if (i === -1) {
          if (this.buf.length > BOUNDARY.length) {
            this.buf = this.buf.subarray(this.buf.length - BOUNDARY.length + 1);
          }
          return;
        }
        this.buf = this.buf.subarray(i + BOUNDARY.length);
        this.state = "read_header";
        continue;
      }

      if (this.state === "read_header") {
        const headerEnd = this.buf.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const header = this.buf.subarray(0, headerEnd).toString("latin1");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          this.state = "seek_boundary";
          this.buf = this.buf.subarray(1);
          continue;
        }

        const len = parseInt(match[1]!, 10);
        if (!Number.isFinite(len) || len <= 0 || len > this.maxBuf) {
          this.state = "seek_boundary";
          this.buf = this.buf.subarray(1);
          continue;
        }

        lastFrameMeta = parseFrameHeaders(header);
        this.bodyRemaining = len;
        this.buf = this.buf.subarray(headerEnd + 4);
        this.state = "read_body";
        continue;
      }

      if (this.state === "read_body") {
        if (this.buf.length < this.bodyRemaining) return;

        const jpeg = this.buf.subarray(0, this.bodyRemaining);
        this.buf = this.buf.subarray(this.bodyRemaining);
        if (this.buf.length >= 2 && this.buf[0] === 0x0d && this.buf[1] === 0x0a) {
          this.buf = this.buf.subarray(2);
        }

        if (jpeg.length >= 3 && jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff) {
          lastJpeg = Buffer.from(jpeg);
          lastJpegAt = Date.now();
          buffer().push(lastJpeg, lastJpegAt);
        }

        this.state = "seek_boundary";
        continue;
      }

      return;
    }
  }
}

let extractor = new MjpegLastFrameExtractor();

export function resetPreviewStreamTapForTests() {
  lastJpeg = null;
  lastJpegAt = 0;
  lastFrameMeta = {};
  extractor = new MjpegLastFrameExtractor();
  buffer().clear();
}

export function tapPreviewStreamChunk(chunk: Buffer) {
  extractor.push(chunk);
}

export function getSharedPreviewFrameBuffer() {
  return buffer();
}

export const previewFrameBuffer = getSharedPreviewFrameBuffer();
