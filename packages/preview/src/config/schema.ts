import { z } from "zod";

export const PreviewEncodeModeSchema = z.enum([
  "software-jpeg",
  "libjpeg-turbo",
  "hardware-h264",
]);

export const PreviewTransportSchema = z.enum([
  "mjpeg-http",
  "h264-annexb-http",
  "h264-fmp4-http",
  "frame-poll-http",
  "webrtc",
]);

export const PreviewProtocolConfigSchema = z.object({
  encodeMode: PreviewEncodeModeSchema.default("software-jpeg"),
  transport: PreviewTransportSchema.default("mjpeg-http"),
  width: z.number().int().min(240).max(1280).default(480),
  height: z.number().int().min(180).max(720).default(360),
  fps: z.number().int().min(1).max(60).default(6),
  jpegQuality: z.number().int().min(20).max(95).default(45),
  h264Bitrate: z.number().int().min(500_000).max(20_000_000).default(2_000_000),
  h264KeyframeIntervalSec: z.number().min(0.1).max(5).default(0.5),
  lowLatency: z.boolean().default(true),
  instrumentMetrics: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type PreviewEncodeMode = z.infer<typeof PreviewEncodeModeSchema>;
export type PreviewTransport = z.infer<typeof PreviewTransportSchema>;
export type PreviewProtocolConfig = z.infer<typeof PreviewProtocolConfigSchema>;

export const PREVIEW_PROFILES = {
  balanced: {
    label: "Balanced",
    description: "640×480 MJPEG @ 12fps — moved up the latency/quality pareto vs legacy 480p/6fps.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "mjpeg-http",
      width: 640,
      height: 480,
      fps: 12,
      jpegQuality: 42,
      lowLatency: true,
    }),
  },
  fastMjpeg: {
    label: "Fast MJPEG",
    description: "720p @ 15fps q42 — highest MJPEG quality on the ~95ms latency band.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "mjpeg-http",
      width: 1280,
      height: 720,
      fps: 15,
      jpegQuality: 42,
      lowLatency: true,
    }),
  },
  mjpegCompact: {
    label: "MJPEG compact",
    description: "640×480 @ 18fps — pareto MJPEG when bandwidth is tight.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "mjpeg-http",
      width: 640,
      height: 480,
      fps: 18,
      jpegQuality: 35,
      lowLatency: true,
    }),
  },
  lowLatency: {
    label: "Low latency (burst)",
    description: "Hardware H.264 720p30 — max quality/latency; thermally aggressive (~79°C in 2min). Lab/burst use.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width: 1280,
      height: 720,
      fps: 30,
      h264Bitrate: 2_000_000,
      h264KeyframeIntervalSec: 0.25,
      lowLatency: true,
    }),
  },
  lowLatencySustained: {
    label: "Low latency (sustained)",
    description: "Hardware H.264 720p24 @ 2Mbps — default for wear: ~20% less sensor heat than 30fps, same encode path.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width: 1280,
      height: 720,
      fps: 24,
      h264Bitrate: 2_000_000,
      h264KeyframeIntervalSec: 0.25,
      lowLatency: true,
    }),
  },
  h264Quality: {
    label: "H.264 quality",
    description: "720p30 @ 3.5Mbps — maximum quality on the measured ~46ms H.264 latency band.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width: 1280,
      height: 720,
      fps: 30,
      h264Bitrate: 3_500_000,
      h264KeyframeIntervalSec: 0.25,
      lowLatency: true,
    }),
  },
  h264Fast: {
    label: "H.264 fast",
    description: "854×480 @ 30fps — lower glass-to-glass than 720p with strong operator quality.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width: 854,
      height: 480,
      fps: 30,
      h264Bitrate: 2_000_000,
      h264KeyframeIntervalSec: 0.25,
      lowLatency: true,
    }),
  },
  h264Compact: {
    label: "H.264 compact",
    description: "640×360 @ 30fps — minimal pixels for lowest transport latency.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width: 640,
      height: 360,
      fps: 30,
      h264Bitrate: 1_500_000,
      h264KeyframeIntervalSec: 0.25,
      lowLatency: true,
    }),
  },
  highResolution: {
    label: "High resolution",
    description: "720p MJPEG for maximum compatibility while tuning quality.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "mjpeg-http",
      width: 1280,
      height: 720,
      fps: 12,
      jpegQuality: 55,
    }),
  },
  turboJpeg: {
    label: "Turbo JPEG (experimental)",
    description: "Native libjpeg-turbo path when compiled on device; falls back to software JPEG.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "libjpeg-turbo",
      transport: "mjpeg-http",
      width: 1280,
      height: 720,
      fps: 15,
      jpegQuality: 50,
    }),
  },
  framePoll: {
    label: "Frame poll",
    description: "Single-frame HTTP polling for constrained browsers or diagnostics.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "frame-poll-http",
      width: 640,
      height: 480,
      fps: 8,
      jpegQuality: 40,
    }),
  },
  webrtc: {
    label: "WebRTC (experimental)",
    description: "Hardware H.264 with WebRTC transport; requires gateway.",
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "webrtc",
      width: 1280,
      height: 720,
      fps: 30,
      h264Bitrate: 2_500_000,
      lowLatency: true,
    }),
  },
} as const satisfies Record<
  string,
  { label: string; description: string; config: PreviewProtocolConfig }
>;

export type PreviewProfileId = keyof typeof PREVIEW_PROFILES;

export function parsePreviewProtocolConfig(input: unknown): PreviewProtocolConfig {
  return PreviewProtocolConfigSchema.parse(input);
}

export function resolvePreviewProfile(profileId: string): PreviewProtocolConfig | null {
  if (profileId in PREVIEW_PROFILES) {
    return PREVIEW_PROFILES[profileId as PreviewProfileId].config;
  }
  return null;
}

export function mergePreviewConfig(
  base: PreviewProtocolConfig,
  patch: Partial<PreviewProtocolConfig>,
): PreviewProtocolConfig {
  return PreviewProtocolConfigSchema.parse({ ...base, ...patch });
}

/** Returns true when encode mode and transport are compatible. */
export function isPreviewConfigCompatible(config: PreviewProtocolConfig): boolean {
  if (config.transport === "webrtc") {
    return config.encodeMode === "hardware-h264";
  }
  if (config.transport === "h264-annexb-http" || config.transport === "h264-fmp4-http") {
    return config.encodeMode === "hardware-h264";
  }
  if (config.transport === "frame-poll-http" || config.transport === "mjpeg-http") {
    return config.encodeMode !== "hardware-h264";
  }
  return true;
}

export function normalizePreviewConfig(input: unknown): PreviewProtocolConfig {
  const parsed = parsePreviewProtocolConfig(input);
  if (isPreviewConfigCompatible(parsed)) return parsed;
  if (parsed.encodeMode === "hardware-h264") {
    return mergePreviewConfig(parsed, { transport: "h264-annexb-http" });
  }
  return mergePreviewConfig(parsed, { transport: "mjpeg-http" });
}
