import type { PreviewEncodeMode, PreviewProtocolConfig, PreviewTransport } from "../config/schema.js";
import {
  DEVICE_PREVIEW_PATHS,
  HOST_PREVIEW_PATHS,
  RAW_PREVIEW_PATHS,
  type PreviewPathTier,
} from "../paths.js";
import {
  FMP4_CONTENT_TYPE,
  H264_ANNEXB_CONTENT_TYPE,
  MJPEG_CONTENT_TYPE,
} from "../constants.js";

export interface PreviewTransportDescriptor {
  id: PreviewTransport;
  label: string;
  description: string;
  contentType: string;
  streamPath: (tier: PreviewPathTier) => string;
  framePath: (tier: PreviewPathTier) => string;
  healthPath: (tier: PreviewPathTier) => string;
  supportsBrowserImgTag: boolean;
  supportsMse: boolean;
  supportsWebRtc: boolean;
  requiresHardwareEncode: boolean;
  experimental: boolean;
}

export interface PreviewEncodeDescriptor {
  id: PreviewEncodeMode;
  label: string;
  description: string;
  targetEncodeMs: number;
  supportsHighResolution: boolean;
  availableOnDevice: boolean;
  experimental: boolean;
}

function tierPaths(tier: PreviewPathTier) {
  return tier === "raw" ? RAW_PREVIEW_PATHS : tier === "device" ? DEVICE_PREVIEW_PATHS : HOST_PREVIEW_PATHS;
}

export const PREVIEW_TRANSPORTS: Record<PreviewTransport, PreviewTransportDescriptor> = {
  "mjpeg-http": {
    id: "mjpeg-http",
    label: "MJPEG over HTTP",
    description: "Multipart JPEG stream compatible with HTML img tags and zero-copy browser decode.",
    contentType: MJPEG_CONTENT_TYPE,
    streamPath: (tier) => tierPaths(tier).streamMjpeg,
    framePath: (tier) => tierPaths(tier).frame,
    healthPath: (tier) => tierPaths(tier).health,
    supportsBrowserImgTag: true,
    supportsMse: false,
    supportsWebRtc: false,
    requiresHardwareEncode: false,
    experimental: false,
  },
  "h264-annexb-http": {
    id: "h264-annexb-http",
    label: "H.264 Annex-B over HTTP",
    description: "Low-latency hardware-encoded NAL unit stream for MSE or custom players.",
    contentType: H264_ANNEXB_CONTENT_TYPE,
    streamPath: (tier) => tierPaths(tier).streamH264AnnexB,
    framePath: (tier) => tierPaths(tier).frame,
    healthPath: (tier) => tierPaths(tier).health,
    supportsBrowserImgTag: false,
    supportsMse: true,
    supportsWebRtc: false,
    requiresHardwareEncode: true,
    experimental: false,
  },
  "h264-fmp4-http": {
    id: "h264-fmp4-http",
    label: "H.264 fMP4 over HTTP",
    description: "Fragmented MP4 stream for Media Source Extensions.",
    contentType: FMP4_CONTENT_TYPE,
    streamPath: (tier) => tierPaths(tier).streamH264Fmp4,
    framePath: (tier) => tierPaths(tier).frame,
    healthPath: (tier) => tierPaths(tier).health,
    supportsBrowserImgTag: false,
    supportsMse: true,
    supportsWebRtc: false,
    requiresHardwareEncode: true,
    experimental: true,
  },
  "frame-poll-http": {
    id: "frame-poll-http",
    label: "JPEG frame polling",
    description: "Repeated GET /frame requests; highest compatibility, not lowest latency.",
    contentType: "image/jpeg",
    streamPath: (tier) => tierPaths(tier).frame,
    framePath: (tier) => tierPaths(tier).frame,
    healthPath: (tier) => tierPaths(tier).health,
    supportsBrowserImgTag: true,
    supportsMse: false,
    supportsWebRtc: false,
    requiresHardwareEncode: false,
    experimental: false,
  },
  webrtc: {
    id: "webrtc",
    label: "WebRTC",
    description: "Peer or gateway mediated realtime transport; pairs with LiveKit/OpenLab voice stack.",
    contentType: "application/sdp",
    streamPath: () => "/api/preview/webrtc/offer",
    framePath: (tier) => tierPaths(tier).frame,
    healthPath: (tier) => tierPaths(tier).health,
    supportsBrowserImgTag: false,
    supportsMse: false,
    supportsWebRtc: true,
    requiresHardwareEncode: true,
    experimental: true,
  },
};

export const PREVIEW_ENCODE_MODES: Record<PreviewEncodeMode, PreviewEncodeDescriptor> = {
  "software-jpeg": {
    id: "software-jpeg",
    label: "Software JPEG",
    description: "YUV_420_888 → NV21 → YuvImage.compressToJpeg on device CPU.",
    targetEncodeMs: 35,
    supportsHighResolution: true,
    availableOnDevice: true,
    experimental: false,
  },
  "libjpeg-turbo": {
    id: "libjpeg-turbo",
    label: "libjpeg-turbo (JNI)",
    description: "Native NEON-optimized JPEG when NDK module is present; falls back to software JPEG.",
    targetEncodeMs: 18,
    supportsHighResolution: true,
    availableOnDevice: false,
    experimental: true,
  },
  "hardware-h264": {
    id: "hardware-h264",
    label: "Hardware H.264",
    description: "Camera2 → MediaCodec input Surface; target sub-25 ms encode at 720p.",
    targetEncodeMs: 12,
    supportsHighResolution: true,
    availableOnDevice: true,
    experimental: false,
  },
};

export function describePreviewStack(config: PreviewProtocolConfig) {
  return {
    encode: PREVIEW_ENCODE_MODES[config.encodeMode],
    transport: PREVIEW_TRANSPORTS[config.transport],
  };
}

export function listEnabledPreviewOptions(opts?: {
  includeExperimental?: boolean;
}) {
  const includeExperimental = opts?.includeExperimental ?? false;
  return {
    encodeModes: Object.values(PREVIEW_ENCODE_MODES).filter(
      (mode) => includeExperimental || !mode.experimental,
    ),
    transports: Object.values(PREVIEW_TRANSPORTS).filter(
      (transport) => includeExperimental || !transport.experimental,
    ),
  };
}
