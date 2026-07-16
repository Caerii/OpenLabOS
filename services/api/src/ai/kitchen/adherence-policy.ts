import type { MultiscaleDecision, MultiscaleEvidence, ValidationScale } from "./multiscale-validation.js";

export type AdherenceAction =
  | "advance"
  | "confirming"
  | "collect_more_evidence"
  | "possible_deviation"
  | "blocked";

export type AdherenceStateName =
  | "watching"
  | "confirming"
  | "passed"
  | "recovering"
  | "blocked";

export interface AdherencePolicyState {
  runId: string;
  stepNumber: number;
  consecutivePasses: number;
  consecutiveUncertain: number;
  consecutiveDeviations: number;
  lastAction: AdherenceAction | null;
  lastConfidence: number;
  updatedAt: number;
}

export interface AdherencePolicyDecision {
  action: AdherenceAction;
  state: AdherenceStateName;
  confidence: number;
  shouldAdvance: boolean;
  shouldRecordVerification: boolean;
  reason: string;
  spokenSummary: string;
  recommendedNextScale?: ValidationScale;
  stateMemory: AdherencePolicyState;
}

export interface EvaluateAdherenceInput {
  runId: string;
  stepNumber: number;
  instruction: string;
  successCriteria?: string;
  decision: MultiscaleDecision;
  evidence: MultiscaleEvidence[];
  now?: number;
}

const HIGH_CONFIDENCE_ADVANCE = 0.85;
const MIN_CONFIRMING_CONFIDENCE = 0.6;
const MAX_UNCERTAIN_BEFORE_DEVIATION = 2;
const MAX_DEVIATIONS_BEFORE_BLOCK = 3;

const policyState = new Map<string, AdherencePolicyState>();

function keyFor(runId: string, stepNumber: number) {
  return `${runId}:${stepNumber}`;
}

function getState(runId: string, stepNumber: number, now: number): AdherencePolicyState {
  const key = keyFor(runId, stepNumber);
  const existing = policyState.get(key);
  if (existing) return existing;
  const created: AdherencePolicyState = {
    runId,
    stepNumber,
    consecutivePasses: 0,
    consecutiveUncertain: 0,
    consecutiveDeviations: 0,
    lastAction: null,
    lastConfidence: 0,
    updatedAt: now,
  };
  policyState.set(key, created);
  return created;
}

function updateState(
  state: AdherencePolicyState,
  action: AdherenceAction,
  confidence: number,
  now: number,
) {
  if (action === "advance" || action === "confirming") {
    state.consecutivePasses += 1;
    state.consecutiveUncertain = 0;
    state.consecutiveDeviations = 0;
  } else if (action === "possible_deviation") {
    state.consecutivePasses = 0;
    state.consecutiveUncertain = 0;
    state.consecutiveDeviations += 1;
  } else if (action === "blocked") {
    state.consecutivePasses = 0;
    state.consecutiveUncertain = 0;
    state.consecutiveDeviations += 1;
  } else {
    state.consecutivePasses = 0;
    state.consecutiveUncertain += 1;
  }
  state.lastAction = action;
  state.lastConfidence = confidence;
  state.updatedAt = now;
  return state;
}

function isInfrastructureWarning(warning: string) {
  return [
    "entity_segmentation_mock",
    "entity_segmentation_sidecar_unconfigured",
    "entity_segmentation_disabled",
  ].some((prefix) => warning.startsWith(prefix));
}

function normalizeWarning(warning: string) {
  return warning
    .replace(/^teacher_issue:/, "")
    .replace(/^missing_object:/, "missing ")
    .replace(/^missing_entity:/, "missing ");
}

function firstUsefulWarning(decision: MultiscaleDecision, evidence: MultiscaleEvidence[]) {
  const warning =
    decision.warnings.find((item) => item && !isInfrastructureWarning(item)) ||
    evidence.flatMap((item) => item.warnings).find((item) => item && !isInfrastructureWarning(item));
  if (!warning) return "";
  return normalizeWarning(warning);
}

function stateNameFor(action: AdherenceAction): AdherenceStateName {
  if (action === "advance") return "passed";
  if (action === "confirming") return "confirming";
  if (action === "possible_deviation") return "recovering";
  if (action === "blocked") return "blocked";
  return "watching";
}

function recommendedScaleFor(decision: MultiscaleDecision): ValidationScale | undefined {
  if (decision.action === "collect_short_chunk") return "short_chunk";
  if (decision.action === "retry_frame") return "frame";
  if (decision.action === "manual_review") return "step_window";
  return undefined;
}

export function evaluateAdherence(input: EvaluateAdherenceInput): AdherencePolicyDecision {
  const now = input.now ?? Date.now();
  const state = getState(input.runId, input.stepNumber, now);
  const confidence = Math.max(0, Math.min(1, input.decision.confidence || 0));
  const blocker = input.decision.blockers.find(Boolean);
  const warning = firstUsefulWarning(input.decision, input.evidence);
  const strongWarning = warning && !warning.startsWith("missing ");
  const hasRequiredCheckFailure = input.evidence.some((item) =>
    item.blockers.some((value) => value.startsWith("required_check_failed")),
  );
  const frameOnlyCompletionSignal =
    !input.decision.stepComplete &&
    input.decision.action === "collect_short_chunk" &&
    confidence >= HIGH_CONFIDENCE_ADVANCE &&
    input.evidence.some((item) => item.modeId === "success-check" && item.passed === true);

  let action: AdherenceAction;
  let reason: string;
  let spokenSummary: string;

  if (blocker && !blocker.startsWith("required_check_failed")) {
    action = "blocked";
    reason = `Blocked by safety or protocol issue: ${blocker}`;
    spokenSummary = `Pause. I see a possible safety or protocol issue: ${blocker}. Correct that before continuing.`;
  } else if (input.decision.stepComplete && confidence >= HIGH_CONFIDENCE_ADVANCE) {
    action = "advance";
    reason = `High-confidence completion evidence (${Math.round(confidence * 100)}%).`;
    spokenSummary = `Confirmed. Step ${input.stepNumber} is complete.`;
  } else if (input.decision.stepComplete && confidence >= MIN_CONFIRMING_CONFIDENCE) {
    const wouldBeSecondPass = state.consecutivePasses + 1 >= 2;
    action = wouldBeSecondPass ? "advance" : "confirming";
    reason = wouldBeSecondPass
      ? `Two consecutive completion signals reached the confirmation threshold.`
      : `Completion signal is plausible but below high-confidence auto-advance threshold.`;
    spokenSummary = wouldBeSecondPass
      ? `Confirmed. Step ${input.stepNumber} is complete.`
      : `This looks close to complete. Hold the result steady for one more check so I can confirm.`;
  } else if (frameOnlyCompletionSignal) {
    const wouldBeSecondPass = state.consecutivePasses + 1 >= 2;
    action = wouldBeSecondPass ? "advance" : "confirming";
    reason = wouldBeSecondPass
      ? "Two consistent high-confidence frame checks passed while short video evidence was unavailable."
      : "Frame evidence strongly suggests completion, but temporal evidence is unavailable.";
    spokenSummary = wouldBeSecondPass
      ? `Confirmed from repeated visual state checks. Step ${input.stepNumber} is complete.`
      : `This appears complete. Hold the result steady for one more check and I can confirm it.`;
  } else if (hasRequiredCheckFailure) {
    action = "collect_more_evidence";
    reason = "A required validation check could not run, so the state machine needs more evidence.";
    spokenSummary = `I still need a better view before I can confirm this step. Keep the relevant objects visible.`;
  } else if (
    input.decision.action === "manual_review" ||
    state.consecutiveUncertain + 1 >= MAX_UNCERTAIN_BEFORE_DEVIATION ||
    strongWarning
  ) {
    action = state.consecutiveDeviations + 1 >= MAX_DEVIATIONS_BEFORE_BLOCK ? "blocked" : "possible_deviation";
    reason = warning
      ? `Possible step deviation: ${warning}`
      : `Repeated uncertain evidence while checking step ${input.stepNumber}.`;
    spokenSummary = warning
      ? `Possible mismatch: ${warning}. Expected: ${input.instruction}`
      : `I am not confident this matches the step yet. Re-orient to the expected action: ${input.instruction}`;
  } else {
    action = "collect_more_evidence";
    reason = input.decision.summary;
    spokenSummary = input.decision.action === "collect_short_chunk"
      ? `Continue naturally for a moment. I need a short action chunk before confirming this step.`
      : `I am still watching. Keep the current step in view so I can confirm it.`;
  }

  const updatedState = updateState(state, action, confidence, now);
  const shouldAdvance = action === "advance";
  return {
    action,
    state: stateNameFor(action),
    confidence,
    shouldAdvance,
    shouldRecordVerification: shouldAdvance || action === "possible_deviation" || action === "blocked",
    reason,
    spokenSummary,
    recommendedNextScale: shouldAdvance ? undefined : recommendedScaleFor(input.decision),
    stateMemory: { ...updatedState },
  };
}

export function resetAdherencePolicyState(runId?: string) {
  if (!runId) {
    policyState.clear();
    return;
  }
  for (const key of policyState.keys()) {
    if (key.startsWith(`${runId}:`)) policyState.delete(key);
  }
}
