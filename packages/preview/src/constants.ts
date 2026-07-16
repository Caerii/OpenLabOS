/** Must match `PreviewServer.BOUNDARY` on device reference implementation. */
export const MJPEG_BOUNDARY = "labos-frame-boundary";

export const MJPEG_CONTENT_TYPE = `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`;

export const H264_ANNEXB_CONTENT_TYPE = "video/h264";

export const FMP4_CONTENT_TYPE = "video/mp4; codecs=avc1";

export const DEFAULT_STREAM_FRAME_FRESH_MS = 4500;

export const DEFAULT_HEALTH_LITE_QUERY = { lite: "1" as const };
