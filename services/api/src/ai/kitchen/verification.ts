import type { ERAnalysisMode } from "./er-modes.js";
import { JudgmentResultSchema, type JudgmentResult } from "./judgment-schema.js";
import type { KitchenProtocol, ProtocolStep } from "./protocols.js";
import type { VerificationResult } from "./tracker.js";

type VerificationSource = {
  parsed?: any;
  raw: string;
};

export type TeacherVerificationResult = VerificationResult & {
  protocolId: string;
  stepNumber: number;
  modelId: string;
};

export function composeVerifyStepPrompt(step: ProtocolStep): string {
  const blocks: string[] = [
    "You are LabOS StepJudge. You see ONE egocentric (smart-glasses) frame of a workspace.",
    `Step ${step.number} — Operator task: ${step.instruction}`,
    `Set success=true only if this is clearly satisfied: ${step.successCriteria}`,
  ];
  if (step.requiredObjects?.length) {
    blocks.push(`Entities to consider: ${step.requiredObjects.join(", ")}.`);
  }
  if (step.spatialHint) blocks.push(`Where to look: ${step.spatialHint}`);
  if (step.hazardChecks?.length) {
    blocks.push(
      "Safety: if a serious hazard is visible (e.g. uncontrolled flame, major spill toward power), answer success=false and explain briefly in reasoning.",
    );
  }
  blocks.push(
    "Calibration: use low confidence when the view is ambiguous, motion-blurred, heavily occluded, or not a real workspace. If the image is clearly a placeholder or UI mock (e.g. dimension text, solid color), answer success=false with high confidence.",
  );
  blocks.push("---");
  blocks.push(step.verificationPrompt);
  return blocks.join("\n\n");
}

export function buildWorkspaceVerificationMode(protocol: KitchenProtocol): ERAnalysisMode {
  return {
    id: "workspace-check",
    name: "Workspace Verification",
    prompt: protocol.workspaceVerificationPrompt,
    systemInstruction: "Be precise. When JSON is requested, reply with ONLY that JSON (no preface, no code block).",
    thinkingBudget: 0,
    outputType: "points",
  };
}

export function summarizeWorkspaceDetections(parsed: unknown) {
  const detections = Array.isArray(parsed) ? parsed : [];
  const missingItems = detections
    .filter((d: any) => d.label?.startsWith("MISSING:"))
    .map((d: any) => d.label.replace("MISSING:", "").trim());
  const detectedItems = detections
    .filter((d: any) => !d.label?.startsWith("MISSING:"))
    .map((d: any) => d.label);
  return {
    detections,
    missingItems,
    detectedItems,
    passed: missingItems.length === 0,
  };
}

export function buildVerificationResult(
  result: VerificationSource,
  frameRef?: string,
): VerificationResult {
  return {
    timestamp: Date.now(),
    success: result.parsed?.success ?? false,
    confidence: result.parsed?.confidence ?? 0,
    reasoning: result.parsed?.reasoning ?? result.raw,
    rawResponse: result.parsed,
    frameRef,
  };
}

export function buildTeacherVerificationResult(
  result: VerificationSource,
  frameRef: string | undefined,
  details: {
    protocolId: string;
    stepNumber: number;
    modelId: string;
  },
): TeacherVerificationResult {
  return {
    ...buildVerificationResult(result, frameRef),
    ...details,
  };
}

export function validateTeacherJudgmentResult(
  parsed: unknown,
  stepId: string,
): JudgmentResult {
  const payload =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  return JudgmentResultSchema.parse({
    ...payload,
    step_id: stepId,
    judgment_schema_version: payload.judgment_schema_version || "labos-judgment-v1",
  });
}
