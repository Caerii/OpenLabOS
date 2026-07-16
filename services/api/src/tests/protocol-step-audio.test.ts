import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getProtocol } from "../ai/kitchen/protocols";
import { resolveProtocolStepAudioClip } from "../lib/protocol-step-audio";

function writeTinyWav(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = Buffer.from("524946462800000057415645666d74201000000001000100401f0000803e000002001000646174610400000000000000", "hex");
  fs.writeFileSync(filePath, header);
}

function prepareVoiceFixture(protocol: NonNullable<ReturnType<typeof getProtocol>>) {
  const publicRoot = path.resolve(process.env.OPENLABOS_PUBLIC_DIR || path.join(process.cwd(), "public"));
  const root = path.resolve(publicRoot, "demo", "protocol-voice-assets", protocol.id);
  const scenarios = [];
  const recordings = [];
  for (const step of protocol.steps) {
    const id = `step-${step.number}`;
    const outputPath = path.join(root, id, "output.wav");
    writeTinyWav(outputPath);
    scenarios.push({
      id,
      title: step.instruction,
      category: "test",
      protocolId: protocol.id,
      stepNumber: step.number,
      trigger: "step_started",
      script: step.instruction,
      recordingId: id,
    });
    recordings.push({
      id,
      scenarioId: id,
      protocolId: protocol.id,
      stepNumber: step.number,
      outputUrl: `/demo/protocol-voice-assets/${protocol.id}/${id}/output.wav`,
    });
  }
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({ protocolId: protocol.id, protocolName: protocol.name, scenarios, recordings }, null, 2),
  );
  return root;
}

function main() {
  const protocol = getProtocol("kitchen-tea-v1");
  assert.ok(protocol, "kitchen tea protocol should exist");
  const fixtureRoot = prepareVoiceFixture(protocol);

  try {
    for (const step of protocol.steps) {
      const clip = resolveProtocolStepAudioClip(protocol.id, step.number, step.instruction);
      assert.equal(clip.protocolId, protocol.id);
      assert.equal(clip.stepNumber, step.number);
      assert.ok(clip.outputUrl.startsWith("/demo/protocol-voice-assets/kitchen-tea-v1/"));
      assert.ok(clip.devicePath.startsWith("/sdcard/LabOS/protocol-audio/kitchen-tea-v1/"));
      assert.ok(clip.devicePath.endsWith(".wav"));
      assert.ok(fs.existsSync(clip.localPath), `expected ${clip.localPath} to exist`);
      assert.ok(clip.bytes > 44, "wav file should contain audio data");
    }

    assert.throws(
      () => resolveProtocolStepAudioClip("kitchen-tea-v1", 0, "bad step"),
      /positive number/,
    );
    assert.throws(
      () => resolveProtocolStepAudioClip("kitchen-tea-v1", 1, "This instruction is unrelated to tea setup"),
      /No step narration clip matched/,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log("[protocol-step-audio] all checks passed");
}

main();
