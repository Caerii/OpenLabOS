import { describe, expect, it } from "vitest";
import {
  detectPreviewClientCapabilities,
  resolveAdaptivePreviewConfig,
  selectOperatorPreviewProfile,
} from "../src/config/adaptive-profile.js";

describe("adaptive preview profile", () => {
  it("selects lowLatencySustained when WebCodecs is available", () => {
    expect(selectOperatorPreviewProfile({ webCodecsH264: true, mjpegImgTag: true })).toBe("lowLatencySustained");
  });

  it("falls back to fastMjpeg without WebCodecs", () => {
    expect(selectOperatorPreviewProfile({ webCodecsH264: false, mjpegImgTag: true })).toBe("fastMjpeg");
  });

  it("resolves full config from capabilities", () => {
    const resolved = resolveAdaptivePreviewConfig({ webCodecsH264: false });
    expect(resolved.profileId).toBe("fastMjpeg");
    expect(resolved.config.transport).toBe("mjpeg-http");
    expect(resolved.config.height).toBe(720);
  });

  it("detects globals safely", () => {
    expect(detectPreviewClientCapabilities({})).toEqual({
      webCodecsH264: false,
      webRtc: false,
      mjpegImgTag: true,
    });
  });
});
