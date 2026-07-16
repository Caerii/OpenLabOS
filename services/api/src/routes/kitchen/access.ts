/**
 * Accessors and parsers for Kitchen route state.
 */

import { protocolStepByNumber, validateProtocolShape } from "../../ai/kitchen/protocol-domain.js";
import type { KitchenProtocol } from "../../ai/kitchen/protocols.js";
import { getProtocol, protocolTracker } from "../../ai/kitchen/index.js";
import { badRequest, notFound } from "../../lib/http.js";

export function getCurrentRunOrThrow() {
  const run = protocolTracker.getCurrentRun();
  if (!run) badRequest("No active run");
  return run;
}

export function getCurrentStepOrThrow() {
  const currentStep = protocolTracker.getCurrentStep();
  if (!currentStep) badRequest("No active step to verify");
  return currentStep;
}

export function getProtocolOrThrow(protocolId: string) {
  const protocol = getProtocol(protocolId);
  if (!protocol) notFound(`Protocol "${protocolId}" not found`);
  return protocol;
}

export function getProtocolStepOrThrow(protocolId: string, stepNumber: number) {
  const protocol = getProtocolOrThrow(protocolId);
  const step = protocolStepByNumber(protocol, stepNumber);
  if (!step) notFound(`Step ${stepNumber} not found for "${protocolId}"`);
  return { protocol, step };
}

export function parseCustomProtocolOrThrow(body: any): KitchenProtocol {
  const result = validateProtocolShape(body);
  if (!result.ok) {
    badRequest(`Invalid protocol: ${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  return result.protocol;
}

export function getRunByIdOrThrow(runId: string) {
  const run = protocolTracker.getRun(runId);
  if (!run) notFound(`Run "${runId}" not found`);
  return run;
}

export function parseTeacherStepRequest(body: any) {
  const { protocolId, stepNumber } = body || {};
  if (!protocolId) badRequest("protocolId is required");
  if (!stepNumber || typeof stepNumber !== "number") badRequest("stepNumber is required");
  return { protocolId, stepNumber };
}

export function serializeCurrentStepState(currentStep: NonNullable<ReturnType<typeof protocolTracker.getCurrentStep>>) {
  return {
    number: currentStep.step.number,
    instruction: currentStep.step.instruction,
    status: currentStep.status,
    attemptId: currentStep.attemptId,
    attemptNumber: currentStep.attemptNumber,
    supersedesAttemptId: currentStep.supersedesAttemptId,
    elapsedMs: currentStep.elapsedMs + (
      currentStep.startedAt && currentStep.status === "active"
        ? Date.now() - currentStep.startedAt
        : 0
    ),
    verificationCount: currentStep.verifications.length,
    lastVerification: currentStep.verifications[currentStep.verifications.length - 1] ?? null,
    requiredObjects: currentStep.step.requiredObjects,
    hazardChecks: currentStep.step.hazardChecks,
    instrumentReads: currentStep.step.instrumentReads,
    spatialHint: currentStep.step.spatialHint,
  };
}
