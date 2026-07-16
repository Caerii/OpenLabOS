import { PREVIEW_PROFILES, type PreviewProfileId, type PreviewProtocolConfig } from "./schema.js";
import { PREVIEW_TRANSPORTS } from "../transport/registry.js";

export type PreviewClientCapabilities = {
  webCodecsH264?: boolean;
  webRtc?: boolean;
  mjpegImgTag?: boolean;
};

export function detectPreviewClientCapabilities(
  globals: { VideoDecoder?: typeof VideoDecoder; RTCPeerConnection?: typeof RTCPeerConnection } = globalThis,
): PreviewClientCapabilities {
  return {
    webCodecsH264: typeof globals.VideoDecoder !== "undefined",
    webRtc: typeof globals.RTCPeerConnection !== "undefined",
    mjpegImgTag: true,
  };
}

/**
 * Operator UI profile selection:
 * - WebCodecs → lowLatencySustained (720p24 H.264) — thermal-safe default on Mentra-class hardware
 * - else → fastMjpeg (720p15, img tag)
 *
 * Use profile `lowLatency` (30fps) only for short burst / lab pareto sweeps.
 */
export function selectOperatorPreviewProfile(
  caps: PreviewClientCapabilities = detectPreviewClientCapabilities(),
): PreviewProfileId {
  if (caps.webCodecsH264) return "lowLatencySustained";
  return "fastMjpeg";
}

export function resolveAdaptivePreviewConfig(
  caps: PreviewClientCapabilities = detectPreviewClientCapabilities(),
): { profileId: PreviewProfileId; config: PreviewProtocolConfig } {
  const profileId = selectOperatorPreviewProfile(caps);
  return { profileId, config: PREVIEW_PROFILES[profileId].config };
}

export function transportForProfile(profileId: PreviewProfileId): PreviewProtocolConfig["transport"] {
  return PREVIEW_PROFILES[profileId].config.transport;
}

export function supportsProfileTransport(
  profileId: PreviewProfileId,
  caps: PreviewClientCapabilities,
): boolean {
  const transport = PREVIEW_TRANSPORTS[transportForProfile(profileId)];
  if (transport.supportsWebRtc) return caps.webRtc === true;
  if (transport.supportsMse || transport.id === "h264-annexb-http") return caps.webCodecsH264 === true;
  return transport.supportsBrowserImgTag;
}
