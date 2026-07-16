import { Transform } from "node:stream";
import { tapPreviewStreamChunk } from "./mjpeg-tap.js";

/** Node-only: tap MJPEG chunks in a pipeline without failing the stream on tap errors. */
export function createMjpegTapTransform(): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        tapPreviewStreamChunk(chunk);
      } catch {
        // never fail the stream on tap errors
      }
      cb(null, chunk);
    },
  });
}
