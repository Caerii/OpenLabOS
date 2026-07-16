import { getProtocol } from "./protocols.js";
import {
  evaluateAdherence,
  resetAdherencePolicyState,
  type AdherenceAction,
  type AdherenceStateName,
} from "./adherence-policy.js";
import type { MultiscaleDecision, MultiscaleEvidence } from "./multiscale-validation.js";
import type { KitchenSessionManifest } from "./session-manifest.js";

export interface KitchenReplayTick {
  label?: string;
  runId: string;
  protocolId: string;
  stepNumber: number;
  decision: MultiscaleDecision;
  evidence: MultiscaleEvidence[];
  expected: {
    action: AdherenceAction;
    state?: AdherenceStateName;
    shouldAdvance: boolean;
    recommendedNextScale?: string;
  };
}

export interface KitchenReplayFixture {
  schemaVersion: "labos.kitchen.replay-fixture.v1";
  fixtureId: string;
  source?: {
    kind: "synthetic" | "session-manifest";
    manifestRef?: string;
    runId?: string;
  };
  protocolId: string;
  notes?: string;
  ticks: KitchenReplayTick[];
}

export interface KitchenReplayMismatch {
  index: number;
  label: string;
  expected: KitchenReplayTick["expected"];
  actual: {
    action: AdherenceAction;
    state: AdherenceStateName;
    shouldAdvance: boolean;
    recommendedNextScale?: string;
  };
}

export interface KitchenReplayResult {
  fixtureId: string;
  protocolId: string;
  tickCount: number;
  mismatches: KitchenReplayMismatch[];
  passed: boolean;
}

function assertFixtureShape(fixture: KitchenReplayFixture) {
  if (fixture.schemaVersion !== "labos.kitchen.replay-fixture.v1") {
    throw new Error(`Unsupported replay fixture schema: ${fixture.schemaVersion}`);
  }
  if (!fixture.fixtureId || !fixture.protocolId || !Array.isArray(fixture.ticks)) {
    throw new Error("Replay fixture must include fixtureId, protocolId, and ticks");
  }
  const protocol = getProtocol(fixture.protocolId);
  if (!protocol) throw new Error(`Replay fixture protocol not found: ${fixture.protocolId}`);
}

export function runKitchenReplayFixture(fixture: KitchenReplayFixture): KitchenReplayResult {
  assertFixtureShape(fixture);
  resetAdherencePolicyState();

  const mismatches: KitchenReplayMismatch[] = [];
  for (let i = 0; i < fixture.ticks.length; i += 1) {
    const tick = fixture.ticks[i];
    const protocol = getProtocol(tick.protocolId);
    const step = protocol?.steps.find((candidate) => candidate.number === tick.stepNumber);
    if (!step) {
      throw new Error(`Replay tick ${i + 1} references missing step ${tick.protocolId}:${tick.stepNumber}`);
    }

    const actual = evaluateAdherence({
      runId: tick.runId,
      stepNumber: tick.stepNumber,
      instruction: step.instruction,
      successCriteria: step.successCriteria,
      decision: tick.decision,
      evidence: tick.evidence,
      now: 1_700_000_000_000 + i,
    });

    const normalizedActual = {
      action: actual.action,
      state: actual.state,
      shouldAdvance: actual.shouldAdvance,
      recommendedNextScale: actual.recommendedNextScale,
    };

    if (
      normalizedActual.action !== tick.expected.action ||
      normalizedActual.shouldAdvance !== tick.expected.shouldAdvance ||
      (tick.expected.state && normalizedActual.state !== tick.expected.state) ||
      (tick.expected.recommendedNextScale && normalizedActual.recommendedNextScale !== tick.expected.recommendedNextScale)
    ) {
      mismatches.push({
        index: i,
        label: tick.label || `tick-${i + 1}`,
        expected: tick.expected,
        actual: normalizedActual,
      });
    }
  }

  return {
    fixtureId: fixture.fixtureId,
    protocolId: fixture.protocolId,
    tickCount: fixture.ticks.length,
    mismatches,
    passed: mismatches.length === 0,
  };
}

function eventDecision(event: KitchenSessionManifest["events"][number]): MultiscaleDecision | null {
  const decision = event.payload?.decision;
  if (
    typeof decision?.stepComplete === "boolean" &&
    typeof decision?.confidence === "number" &&
    typeof decision?.action === "string"
  ) {
    return decision as MultiscaleDecision;
  }
  return null;
}

function eventEvidence(event: KitchenSessionManifest["events"][number]): MultiscaleEvidence[] {
  const evidence = event.payload?.evidence;
  return Array.isArray(evidence) ? evidence as MultiscaleEvidence[] : [];
}

export function replayFixtureFromSessionManifest(
  manifest: KitchenSessionManifest,
  opts: { fixtureId?: string; manifestRef?: string } = {},
): KitchenReplayFixture {
  const runId = manifest.run.id;
  const ticks = manifest.events
    .filter((event) => event.type === "verify_step" && event.payload?.source === "adherence-tick")
    .map((event, index): KitchenReplayTick | null => {
      const decision = eventDecision(event);
      const adherence = event.payload?.adherence;
      const stepNumber = Number(event.payload?.stepNumber || 0);
      if (!decision || !adherence?.action || !stepNumber) return null;
      return {
        label: `manifest-tick-${index + 1}`,
        runId,
        protocolId: manifest.run.protocolId,
        stepNumber,
        decision,
        evidence: eventEvidence(event),
        expected: {
          action: adherence.action,
          state: adherence.state,
          shouldAdvance: !!adherence.shouldAdvance,
          recommendedNextScale: adherence.recommendedNextScale,
        },
      };
    })
    .filter((tick): tick is KitchenReplayTick => !!tick);

  return {
    schemaVersion: "labos.kitchen.replay-fixture.v1",
    fixtureId: opts.fixtureId || `${runId}-replay`,
    source: {
      kind: "session-manifest",
      manifestRef: opts.manifestRef,
      runId,
    },
    protocolId: manifest.run.protocolId,
    notes: "Generated from a saved kitchen session manifest. Replays deterministic adherence policy decisions, not VLM calls.",
    ticks,
  };
}
