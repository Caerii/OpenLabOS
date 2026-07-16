import {
  evaluateAdherence,
} from "../../ai/kitchen/index.js";
import { workflowPresetForProtocol } from "../../ai/workflows/index.js";
import { findSpatialSummaryInEvidence, formatSpatialSummaryForVoice, type SpatialSummary } from "../../ai/kitchen/spatial-summary.js";
import { getLiveCoachConfig } from "../../live-coach/config.js";
import { readJpegDimensions } from "../../lib/jpeg.js";
import { badRequest } from "../../lib/http.js";
import { executeStepMultiscaleValidation } from "./multiscale-executor.js";
import {
  getCurrentRunOrThrow,
  getCurrentStepOrThrow,
  saveFrameIfPresent,
  sendLiveCoachAdherenceContext,
} from "./shared.js";
import { createKitchenRunService } from "./run-service-adapter.js";

export interface KitchenAdherenceTickResult {
  success: boolean;
  plan: unknown;
  selectedChecks: unknown[];
  evidence: unknown[];
  decision: unknown;
  adherence: ReturnType<typeof evaluateAdherence>;
  verification: unknown | null;
  stepAdvanced: boolean;
  runCompleted: boolean;
  currentStep: { number: number; instruction: string } | null;
  frameRef?: string;
  rollingChunk?: unknown;
  spatialSummary?: SpatialSummary | null;
  spatialContextText?: string | null;
}

export async function runKitchenAdherenceTick(body: any = {}): Promise<KitchenAdherenceTickResult> {
  const run = getCurrentRunOrThrow();
  if (run.status !== "running") {
    badRequest("Run must be running before adherence checks can execute");
  }
  const currentStep = getCurrentStepOrThrow();

  const {
    plan,
    selectedChecks,
    evidence,
    decision,
    frameBuffer,
    rollingChunk,
  } = await executeStepMultiscaleValidation({
    protocolId: run.protocolId,
    stepNumber: currentStep.step.number,
    runId: run.id,
    body,
    defaultMaxChecks: workflowPresetForProtocol(run.protocolId).supervisor.maxChecks,
  });
  const frameRef = await saveFrameIfPresent(frameBuffer, `adherence-step${currentStep.step.number}-${run.id}`);
  const adherence = evaluateAdherence({
    runId: run.id,
    stepNumber: currentStep.step.number,
    instruction: currentStep.step.instruction,
    successCriteria: currentStep.step.successCriteria,
    decision,
    evidence,
  });
  const dims = frameBuffer ? readJpegDimensions(frameBuffer) : null;
  const spatialSummary = findSpatialSummaryInEvidence(evidence, {
    requiredObjects: currentStep.step.requiredObjects,
    frameWidth: dims?.width,
    frameHeight: dims?.height,
  });
  const spatialContextText = getLiveCoachConfig().spatialContextEnabled
    ? formatSpatialSummaryForVoice(spatialSummary)
    : null;

  const verification = adherence.shouldRecordVerification
    ? {
        timestamp: Date.now(),
        success: adherence.shouldAdvance,
        confidence: adherence.confidence,
        reasoning: adherence.reason,
        rawResponse: {
          source: "adherence-tick",
          adherence,
          decision,
          evidence,
          rollingChunk,
        },
        frameRef,
      }
    : null;

  const progression = await createKitchenRunService().applyStepEvidence({
    run,
    currentStep,
    verification,
    eventPayload: {
      source: "adherence-tick",
      stepNumber: currentStep.step.number,
      selectedChecks,
      decision,
      adherence,
      verification,
      frameRef,
      rollingChunk,
    },
    onRecorded: () => sendLiveCoachAdherenceContext(
      run,
      currentStep,
      adherence,
      decision,
      spatialContextText || undefined,
    ),
  });

  return {
    success: evidence.some((item) => item.ok),
    plan,
    selectedChecks,
    evidence,
    decision,
    adherence,
    verification,
    stepAdvanced: progression.stepAdvanced,
    runCompleted: progression.runCompleted,
    currentStep: progression.currentStep,
    frameRef,
    rollingChunk,
    spatialSummary,
    spatialContextText,
  };
}
