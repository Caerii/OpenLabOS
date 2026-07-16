import assert from "node:assert/strict";
import {
  getPreviewProtocolConfig,
  previewProtocolCatalog,
  resetPreviewProtocolConfigForTests,
  setPreviewProtocolConfig,
} from "../preview/preview-protocol-config.js";

function main() {
  resetPreviewProtocolConfigForTests();
  const catalog = previewProtocolCatalog();
  assert.equal(catalog.ok, true);
  assert.ok(catalog.profiles.length >= 4);

  const lowLatency = setPreviewProtocolConfig({
    encodeMode: "hardware-h264",
    transport: "mjpeg-http",
    width: 1280,
    height: 720,
    fps: 30,
  });
  assert.equal(lowLatency.transport, "h264-annexb-http");
  assert.equal(getPreviewProtocolConfig().width, 1280);

  console.log("[preview-protocol-config] all checks passed");
}

main();
