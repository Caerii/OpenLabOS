import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stepIntroClipFor } from "../components/kitchen/guided/protocolVoiceAssets";
import { getProtocol } from "../../server/ai/kitchen/protocols";

function staticDemoFilePath(url: string) {
  const localPath = url.replace(/^\//, "").replace(/^demo\//, "public/demo/");
  return path.resolve(process.cwd(), localPath);
}

function main() {
  const currentManifest = {
    scenarios: [
      {
        id: "kitchen-tea-v1__step-1__intro-set-up-the-workspace",
        title: "Step 1: coach the next action",
        category: "step_intro",
        protocolId: "kitchen-tea-v1",
        stepNumber: 1,
        trigger: "step_started",
        script: "Step 1: Set up the workspace with the mug, hot water source, tea bag, spoon, tray, and clear counter visible.",
        recordingId: "kitchen-tea-v1__step-1__intro-set-up-the-workspace",
      },
    ],
    recordings: [
      {
        id: "kitchen-tea-v1__step-1__intro-set-up-the-workspace",
        scenarioId: "kitchen-tea-v1__step-1__intro-set-up-the-workspace",
        outputUrl: "/demo/protocol-voice-assets/kitchen-tea-v1/setup/output.wav",
      },
    ],
  };

  const setup = stepIntroClipFor(
    currentManifest,
    1,
    "Set up the workspace with the mug, hot water source, tea bag, spoon, tray, and clear counter visible",
  );
  assert.equal(setup?.url, "/demo/protocol-voice-assets/kitchen-tea-v1/setup/output.wav");
  const setupWithMinorCopyDrift = stepIntroClipFor(
    currentManifest,
    1,
    "Set up the workspace with the mug, kettle or hot water source, tea bag, spoon, and tray visible",
  );
  assert.equal(setupWithMinorCopyDrift?.url, "/demo/protocol-voice-assets/kitchen-tea-v1/setup/output.wav");

  const staleManifest = {
    scenarios: [
      {
        id: "kitchen-tea-v1__step-1__intro-place-the-mug-on-the-counter-in-your-workspace",
        title: "Step 1: coach the next action",
        category: "step_intro",
        protocolId: "kitchen-tea-v1",
        stepNumber: 1,
        trigger: "step_started",
        script: "Step 1: Place the mug on the counter in your workspace.",
        recordingId: "kitchen-tea-v1__step-1__intro-place-the-mug-on-the-counter-in-your-workspace",
      },
    ],
    recordings: [
      {
        id: "kitchen-tea-v1__step-1__intro-place-the-mug-on-the-counter-in-your-workspace",
        scenarioId: "kitchen-tea-v1__step-1__intro-place-the-mug-on-the-counter-in-your-workspace",
        outputUrl: "/demo/protocol-voice-assets/kitchen-tea-v1/old-step1/output.wav",
      },
    ],
  };

  assert.equal(
    stepIntroClipFor(
      staleManifest,
      1,
      "Set up the workspace with the mug, hot water source, tea bag, spoon, tray, and clear counter visible",
    ),
    null,
  );

  const manifestPath = path.resolve(process.cwd(), "public/demo/protocol-voice-assets/kitchen-tea-v1/manifest.json");
  const protocol = getProtocol("kitchen-tea-v1");
  assert.ok(protocol, "kitchen tea protocol should exist");
  assert.ok(fs.existsSync(manifestPath), "static protocol voice manifest should exist");
  const generatedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.equal(generatedManifest.generatedRecordingCount, 9);
  assert.equal(generatedManifest.missingCount, 0);
  for (const category of ["welcome", "preflight", "completion"]) {
    assert.ok(
      generatedManifest.recordings.some((recording: any) => recording.category === category),
      `expected generated ${category} voice clip`,
    );
  }
  for (const step of protocol.steps) {
    const clip = stepIntroClipFor(generatedManifest, step.number, step.instruction);
    assert.ok(clip, `expected generated voice clip for step ${step.number}`);
    assert.ok(fs.existsSync(staticDemoFilePath(clip.url)), `expected ${clip.url} to exist`);
  }

  console.log("[protocol-voice-assets] all checks passed");
}

main();
