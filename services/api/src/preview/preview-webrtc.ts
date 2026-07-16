/**
 * Preview WebRTC gateway scaffold.
 *
 * Mathematical model: WebRTC adds ICE/DTLS/SRTP framing (~48+ bytes/frame) but removes
 * HTTP head-of-line blocking — L_publishToClient becomes RTT-bound instead of multipart
 * parser bound. Target when LABOS_PREVIEW_WEBRTC=1 + LiveKit/gateway bridge is wired.
 */
import type { PreviewProtocolConfig } from "@openlabos/preview";

export type PreviewWebRtcProvider = "loopback" | "livekit" | "disabled";

export interface PreviewWebRtcConfig {
  enabled: boolean;
  provider: PreviewWebRtcProvider;
  iceServers: Array<{ urls: string | string[] }>;
  bridgeNote: string;
}

export interface PreviewWebRtcOfferRequest {
  sdp?: string;
  type?: "offer";
  profileId?: string;
}

export interface PreviewWebRtcOfferResponse {
  ok: boolean;
  provider: PreviewWebRtcProvider;
  answer?: { type: "answer"; sdp: string };
  error?: string;
  config?: PreviewWebRtcConfig;
  recommendedProfile?: PreviewProtocolConfig;
}

export function getPreviewWebRtcConfig(): PreviewWebRtcConfig {
  const enabled = process.env.LABOS_PREVIEW_WEBRTC === "1" || process.env.LABOS_PREVIEW_WEBRTC === "true";
  const provider = (process.env.LABOS_PREVIEW_WEBRTC_PROVIDER as PreviewWebRtcProvider) || "loopback";
  return {
    enabled,
    provider: enabled ? provider : "disabled",
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    bridgeNote:
      "Device H.264 Annex-B → gateway encoder track → browser RTCPeerConnection. Enable with LABOS_PREVIEW_WEBRTC=1.",
  };
}

export function handlePreviewWebRtcOffer(body: PreviewWebRtcOfferRequest): PreviewWebRtcOfferResponse {
  const config = getPreviewWebRtcConfig();
  if (!config.enabled) {
    return {
      ok: false,
      provider: "disabled",
      error: "Preview WebRTC gateway not enabled. Set LABOS_PREVIEW_WEBRTC=1.",
      config,
    };
  }
  if (!body.sdp || body.type !== "offer") {
    return { ok: false, provider: config.provider, error: "Expected { type: 'offer', sdp: '...' }", config };
  }
  if (config.provider === "loopback") {
    return {
      ok: false,
      provider: "loopback",
      error: "Loopback preview WebRTC bridge not yet connected to device Annex-B tap. Use h264-annexb-http + WebCodecs.",
      config,
    };
  }
  return { ok: false, provider: config.provider, error: "Provider not configured", config };
}
