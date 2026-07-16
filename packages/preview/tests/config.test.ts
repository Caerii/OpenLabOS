import { describe, expect, it } from "vitest";
import {
  PREVIEW_PROFILES,
  isPreviewConfigCompatible,
  mergePreviewConfig,
  normalizePreviewConfig,
  parsePreviewProtocolConfig,
} from "../src/config/schema.js";
import { PREVIEW_ENCODE_MODES, PREVIEW_TRANSPORTS } from "../src/transport/registry.js";

describe("preview protocol config", () => {
  it("parses defaults", () => {
    const config = parsePreviewProtocolConfig({});
    expect(config.encodeMode).toBe("software-jpeg");
    expect(config.transport).toBe("mjpeg-http");
    expect(config.width).toBe(480);
  });

  it("normalizes incompatible transport/encode pairs", () => {
    const normalized = normalizePreviewConfig({
      encodeMode: "hardware-h264",
      transport: "mjpeg-http",
    });
    expect(normalized.transport).toBe("h264-annexb-http");
  });

  it("exposes named profiles", () => {
    expect(PREVIEW_PROFILES.lowLatency.config.encodeMode).toBe("hardware-h264");
    expect(PREVIEW_PROFILES.highResolution.config.width).toBe(1280);
  });

  it("validates compatibility helper", () => {
    expect(
      isPreviewConfigCompatible(
        mergePreviewConfig(parsePreviewProtocolConfig({}), { transport: "webrtc", encodeMode: "hardware-h264" }),
      ),
    ).toBe(true);
    expect(
      isPreviewConfigCompatible(
        mergePreviewConfig(parsePreviewProtocolConfig({}), { transport: "mjpeg-http", encodeMode: "hardware-h264" }),
      ),
    ).toBe(false);
  });

  it("registers all transports and encode modes", () => {
    expect(Object.keys(PREVIEW_TRANSPORTS).length).toBe(5);
    expect(Object.keys(PREVIEW_ENCODE_MODES).length).toBe(3);
  });
});
