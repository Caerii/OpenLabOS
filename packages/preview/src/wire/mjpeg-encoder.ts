import { MJPEG_BOUNDARY } from "../constants.js";

export function buildMjpegPart(jpeg: Uint8Array, timingHeaders?: Record<string, string | number>): string {
  const lines = [
    `--${MJPEG_BOUNDARY}`,
    "Content-Type: image/jpeg",
  ];
  if (timingHeaders) {
    for (const [key, value] of Object.entries(timingHeaders)) {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push(`Content-Length: ${jpeg.length}`, "", "");
  return lines.join("\r\n");
}

export function buildMinimalMjpegChunk(
  jpeg: Uint8Array,
  timingHeaders?: Record<string, string | number>,
): Uint8Array {
  const header = new TextEncoder().encode(buildMjpegPart(jpeg, timingHeaders));
  const suffix = new TextEncoder().encode("\r\n");
  const out = new Uint8Array(header.length + jpeg.length + suffix.length);
  out.set(header, 0);
  out.set(jpeg, header.length);
  out.set(suffix, header.length + jpeg.length);
  return out;
}
