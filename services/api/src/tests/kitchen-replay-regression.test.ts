import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  replayFixtureFromSessionManifest,
  runKitchenReplayFixture,
  type KitchenReplayFixture,
} from "../ai/kitchen/replay.js";
import type { KitchenSessionManifest } from "../ai/kitchen/session-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<KitchenReplayFixture> {
  const filePath = path.join(__dirname, "fixtures", "kitchen", name);
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as KitchenReplayFixture;
}

async function main() {
  const fixture = await loadFixture("replay-tea-policy.json");
  const result = runKitchenReplayFixture(fixture);
  assert.equal(result.passed, true, JSON.stringify(result.mismatches, null, 2));
  assert.equal(result.tickCount, fixture.ticks.length);

  const manifest: KitchenSessionManifest = {
    schemaVersion: "labos.kitchen.session-manifest.v1",
    generatedAt: new Date(0).toISOString(),
    run: {
      id: "run-from-manifest",
      protocolId: "kitchen-tea-v1",
      protocolName: "Make a Cup of Tea",
      status: "running",
      createdAt: 1,
      currentStepIndex: 0,
      metrics: {},
    },
    captureContract: {
      primaryArtifact: "frame_sequence",
      frameRefRoot: "dashboard/data",
      temporalChunks: "rolling_preview_mp4",
      stepBoundaries: "step_segments",
    },
    validationCatalog: {
      checks: [],
    },
    steps: [],
    stepAttempts: [],
    stepSegments: [],
    frames: [],
    chunks: [],
    adherence: [],
    events: [
      {
        ts: 1,
        type: "verify_step",
        runId: "run-from-manifest",
        protocolId: "kitchen-tea-v1",
        payload: {
          source: "adherence-tick",
          stepNumber: 1,
          decision: fixture.ticks[1].decision,
          evidence: fixture.ticks[1].evidence,
          adherence: {
            action: "confirming",
            state: "confirming",
            shouldAdvance: false,
            recommendedNextScale: "short_chunk",
          },
        },
      },
    ],
    exportHints: {
      trainingRepoRawTarget: "openlabos-training/data/raw/openlabos-runs",
      stableJoinKeys: ["run.id", "run.protocolId", "steps.number", "frames.frameRef"],
    },
  };

  const generated = replayFixtureFromSessionManifest(manifest, { fixtureId: "manifest-smoke" });
  assert.equal(generated.fixtureId, "manifest-smoke");
  assert.equal(generated.source?.kind, "session-manifest");
  assert.equal(generated.ticks.length, 1);
  assert.equal(runKitchenReplayFixture(generated).passed, true);

  console.log("[kitchen-replay-regression] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
