import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  replayFixtureFromSessionManifest,
  runKitchenReplayFixture,
  type KitchenReplayFixture,
} from "../../../src/ai/kitchen/replay.js";
import type { KitchenSessionManifest } from "../../../src/ai/kitchen/session-manifest.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(): KitchenReplayFixture {
  const raw = readFileSync(path.join(here, "fixture.json"), "utf8");
  return JSON.parse(raw) as KitchenReplayFixture;
}

describe("kitchen-tea-smoke replay harness", () => {
  it("replays the minimal fixture without policy mismatches", () => {
    const fixture = loadFixture();
    const result = runKitchenReplayFixture(fixture);
    expect(result.passed).toBe(true);
    expect(result.fixtureId).toBe("kitchen-tea-smoke-v1");
    expect(result.protocolId).toBe("kitchen-tea-v1");
    expect(result.tickCount).toBe(1);
    expect(result.mismatches).toEqual([]);
  });

  it("builds a replay fixture from a saved session manifest", () => {
    const fixture = loadFixture();
    const tick = fixture.ticks[0];
    const manifest: KitchenSessionManifest = {
      schemaVersion: "labos.kitchen.session-manifest.v1",
      generatedAt: new Date(0).toISOString(),
      run: {
        id: "kitchen-tea-smoke-run",
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
      validationCatalog: { checks: [] },
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
          runId: "kitchen-tea-smoke-run",
          protocolId: "kitchen-tea-v1",
          payload: {
            source: "adherence-tick",
            stepNumber: tick.stepNumber,
            decision: tick.decision,
            evidence: tick.evidence,
            adherence: {
              action: tick.expected.action,
              state: tick.expected.state,
              shouldAdvance: tick.expected.shouldAdvance,
              recommendedNextScale: tick.expected.recommendedNextScale,
            },
          },
        },
      ],
      exportHints: {
        trainingRepoRawTarget: "openlabos-training/data/raw/openlabos-runs",
        stableJoinKeys: ["run.id", "run.protocolId", "steps.number", "frames.frameRef"],
      },
    };

    const generated = replayFixtureFromSessionManifest(manifest, {
      fixtureId: "kitchen-tea-smoke-from-manifest",
      manifestRef: "data/sessions/kitchen-tea-smoke-run/manifest.json",
    });
    const replay = runKitchenReplayFixture(generated);
    expect(replay.passed).toBe(true);
    expect(generated.source?.kind).toBe("session-manifest");
    expect(generated.ticks).toHaveLength(1);
  });
});
