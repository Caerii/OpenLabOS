/** Raw preview server tier (ADB-forwarded port 8089 on reference device). */
export const RAW_PREVIEW_PATHS = {
  health: "/health",
  frame: "/frame",
  streamMjpeg: "/stream",
  streamH264AnnexB: "/stream/avc",
  streamH264Fmp4: "/stream/fmp4",
  config: "/config",
  metrics: "/metrics",
} as const;

/** Device dashboard HTTP tier (port 8080). */
export const DEVICE_PREVIEW_PATHS = {
  start: "/api/preview/start",
  stop: "/api/preview/stop",
  health: "/api/preview/health",
  frame: "/api/preview/frame",
  streamMjpeg: "/api/preview/stream",
  streamH264AnnexB: "/api/preview/stream/avc",
  streamH264Fmp4: "/api/preview/stream/fmp4",
  config: "/api/preview/config",
  metrics: "/api/preview/metrics",
  recordingStart: "/api/preview/recording/start",
  recordingStop: "/api/preview/recording/stop",
  recordingStatus: "/api/preview/recording/status",
} as const;

/** Host coordination API tier (Express/Hono proxy). */
export const HOST_PREVIEW_PATHS = {
  health: "/api/preview/health",
  frame: "/api/preview/frame",
  streamMjpeg: "/api/preview/stream",
  streamH264AnnexB: "/api/preview/stream/avc",
  streamH264Fmp4: "/api/preview/stream/fmp4",
  config: "/api/preview/config",
  metrics: "/api/preview/metrics",
  buffer: "/api/preview/buffer",
} as const;

export type PreviewPathTier = "raw" | "device" | "host";

export function streamPathForTransport(
  transport: string,
  tier: PreviewPathTier = "host",
): string {
  const table =
    tier === "raw"
      ? RAW_PREVIEW_PATHS
      : tier === "device"
        ? DEVICE_PREVIEW_PATHS
        : HOST_PREVIEW_PATHS;

  switch (transport) {
    case "h264-annexb-http":
      return table.streamH264AnnexB;
    case "h264-fmp4-http":
      return table.streamH264Fmp4;
    case "mjpeg-http":
    case "frame-poll-http":
    default:
      return table.streamMjpeg;
  }
}
