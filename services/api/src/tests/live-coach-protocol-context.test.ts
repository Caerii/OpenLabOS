import assert from "node:assert/strict";
import { TEA_PROTOCOL, TOAST_PROTOCOL } from "../ai/kitchen/protocols.js";
import {
  findProtocolSwitchCommand,
  formatProtocolContextForVoice,
  protocolContextFromProtocol,
} from "../live-coach/protocol-context.js";
import { readJpegDimensions } from "../live-coach/live-coach.js";

function jpegWithSize(width: number, height: number) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function main() {
  const protocols = [TEA_PROTOCOL, TOAST_PROTOCOL];
  assert.equal(findProtocolSwitchCommand("switch to the toast protocol", protocols)?.protocol.id, "kitchen-toast-v1");
  assert.equal(findProtocolSwitchCommand("let's make a cup of tea", protocols)?.protocol.id, "kitchen-tea-v1");
  assert.equal(findProtocolSwitchCommand("what do I do next?", protocols), null);

  const tea = protocolContextFromProtocol(TEA_PROTOCOL);
  assert.equal(tea.stepCount, 6);
  assert.equal(tea.firstStep?.number, 1);
  assert.ok(tea.inventory.includes("mug"));

  const prompt = formatProtocolContextForVoice(tea);
  assert.match(prompt, /structured protocol-adherence run/i);
  assert.match(prompt, /Required inventory/i);

  assert.deepEqual(readJpegDimensions(jpegWithSize(1280, 720)), { width: 1280, height: 720 });
  assert.equal(readJpegDimensions(Buffer.from("not a jpeg")), null);

  console.log("[live-coach-protocol-context] all checks passed");
}

main();
