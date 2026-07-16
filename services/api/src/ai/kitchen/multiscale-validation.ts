import {
  beforeAfterMode,
  handTrackingMode,
  instrumentReadMode,
  liquidLevelMode,
  objectPointingMode,
  safetyCheckMode,
  successCheckMode,
  vqaAnnotationMode,
  type ERAnalysisMode,
} from "./er-modes.js";
import { buildStepVqaQuestions } from "./vqa-annotations.js";
import { buildTeacherJudgmentMode } from "./teacher-judgment.js";
import type { KitchenProtocol, ProtocolStep } from "./protocols.js";
import { composeVerifyStepPrompt } from "./verification.js";
import { toClosedWorldStepId } from "./step-ids.js";
import { protocolInventoryNames, protocolStepByNumber } from "./protocol-domain.js";
import {
  DEFAULT_MULTISCALE_POLICY,
  needsInstrumentEvidence,
  needsLiquidEvidence,
  needsTemporalEvidence,
  primaryLiquidContainer,
  validationCheck as check,
} from "./multiscale-policy.js";
import type {
  MultiscaleValidationCheck,
  ProtocolMultiscalePlan,
  StepValidationPlan,
} from "./multiscale-types.js";

export { DEFAULT_MULTISCALE_POLICY } from "./multiscale-policy.js";
export {
  aggregateMultiscaleEvidence,
  evidenceFromError,
  evidenceFromResult,
} from "./multiscale-evidence.js";
export { selectExecutableValidationChecks } from "./multiscale-selection.js";
export type {
  MultiscaleDecision,
  MultiscaleEvidence,
  MultiscaleValidationCheck,
  ProtocolMultiscalePlan,
  StepValidationPlan,
  ValidationDecisionAction,
  ValidationInputKind,
  ValidationScale,
} from "./multiscale-types.js";

export function buildStepValidationPlan(protocol: KitchenProtocol, step: ProtocolStep): StepValidationPlan {
  const stepId = toClosedWorldStepId(protocol.id, step.number);
  const temporal = needsTemporalEvidence(step);
  const checks: MultiscaleValidationCheck[] = [
    check(
      `${stepId}:objects`,
      "frame",
      "object-pointing",
      "Required object presence",
      "Confirm the current egocentric frame contains objects needed for this step.",
      "Run before completion checks and after ambiguous failures.",
      ["current-frame", "test-image"],
      10,
    ),
    check(
      `${stepId}:success`,
      "frame",
      "success-check",
      "Single-frame success check",
      "Judge whether the current frame clearly satisfies the step success criteria.",
      "Run on candidate step completion frames.",
      ["current-frame", "test-image"],
      20,
      true,
    ),
  ];

  checks.push(check(
    `${stepId}:vqa`,
    "frame",
    "vqa-annotation",
    "Step VQA annotation",
    "Answer protocol-scoped visual questions for the current frame so live runs create reusable teacher/student training annotations.",
    "Run at low cadence on candidate step frames or on confirm-step frames when live VQA annotations are enabled.",
    ["current-frame", "test-image"],
    22,
  ));

  if (step.requiredObjects?.length) {
    checks.push(check(
      `${stepId}:entities`,
      "frame",
      "entity-segmentation",
      "Entity masks and tracks",
      "Create object-level masks/tracks for required entities so adherence can use grounded objects instead of only text descriptions.",
      "Run after required-object checks when the step needs protocol objects to be localized precisely.",
      ["current-frame", "test-image"],
      21,
    ));
  }

  if (step.hazardChecks?.length) {
    checks.push(check(
      `${stepId}:safety`,
      "frame",
      "safety-check",
      "Step safety monitor",
      "Detect hazards that should block advancement or trigger voice correction.",
      "Run continuously at low cadence while this step is active.",
      ["current-frame", "test-image"],
      15,
      true,
      1500,
    ));
  }

  if (temporal) {
    checks.push(check(
      `${stepId}:hands`,
      "frame",
      "hand-tracking",
      "Hands and manipulated object",
      "Detect whether hands are manipulating the relevant object for this step.",
      "Run on frames leading into a suspected step boundary.",
      ["current-frame", "test-image"],
      30,
    ));
    checks.push(check(
      `${stepId}:video-action`,
      "short_chunk",
      "teacher-judgment",
      "Short video action judgment",
      "Use a 2-5 second chunk to judge action direction and step adherence.",
      "Run when frame checks are uncertain or an action boundary is detected.",
      ["video-chunk"],
      40,
      true,
    ));
  }

  if (needsLiquidEvidence(step)) {
    checks.push(check(
      `${stepId}:liquid-level`,
      "frame",
      "liquid-level",
      "Liquid level/state read",
      "Estimate fill level or liquid state when the protocol step depends on fluid state.",
      "Run after pour/fill actions and before advancing.",
      ["current-frame", "test-image"],
      35,
    ));
  }

  if (needsInstrumentEvidence(step)) {
    checks.push(check(
      `${stepId}:instrument`,
      "frame",
      "instrument-read",
      "Instrument/display read",
      "Read markings, timers, gauges, thermometers, or appliance displays relevant to the step.",
      "Run when the step has numeric or instrument criteria.",
      ["current-frame", "test-image"],
      36,
    ));
  }

  checks.push(check(
    `${stepId}:before-after`,
    "step_window",
    "before-after",
    "Before/after state transition",
    "Compare pre-step and current evidence to verify that a meaningful state transition occurred.",
    "Run for audit, disputed steps, or post-hoc validation.",
    ["before-after"],
    50,
  ));

  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    stepNumber: step.number,
    stepId,
    instruction: step.instruction,
    successCriteria: step.successCriteria,
    requiredObjects: step.requiredObjects || [],
    checks: checks.sort((a, b) => a.priority - b.priority),
    aggregation: {
      minCompletionConfidence: DEFAULT_MULTISCALE_POLICY.minCompletionConfidence,
      requireTemporalEvidence: temporal,
      blockOnUnsafeState: true,
    },
  };
}

export function buildProtocolMultiscalePlan(protocol: KitchenProtocol): ProtocolMultiscalePlan {
  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    workspaceChecks: [
      check(
        `${protocol.id}:workspace-inventory`,
        "frame",
        "workspace-check",
        "Workspace inventory",
        "Verify required tools and ingredients are visible before the run starts.",
        "Run once before step 1, then rerun after missing-object recovery.",
        ["current-frame", "test-image"],
        1,
        true,
      ),
      check(
        `${protocol.id}:workspace-safety`,
        "frame",
        "safety-check",
        "Global safety baseline",
        "Detect hazards before beginning hands-free guidance.",
        "Run before the first step and during hazardous operations.",
        ["current-frame", "test-image"],
        2,
        true,
      ),
    ],
    stepPlans: protocol.steps.map((step) => buildStepValidationPlan(protocol, step)),
    sessionChecks: [
      check(
        `${protocol.id}:session-order`,
        "session",
        "order-adherence",
        "Protocol order adherence",
        "Confirm completed steps match the protocol sequence without skipped required states.",
        "Run from saved run events and evidence after each step.",
        ["run-history"],
        100,
        true,
      ),
      check(
        `${protocol.id}:session-coverage`,
        "session",
        "evidence-coverage",
        "Evidence coverage audit",
        "Verify every completed step has sufficient frame/chunk evidence for later supervision.",
        "Run at the end of a demo run.",
        ["run-history"],
        110,
      ),
    ],
    realtimePolicy: {
      frameSampleFps: DEFAULT_MULTISCALE_POLICY.frameSampleFps,
      defaultVideoFps: DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
      shortChunkSeconds: DEFAULT_MULTISCALE_POLICY.shortChunkSeconds,
      stepWindowSeconds: DEFAULT_MULTISCALE_POLICY.stepWindowSeconds,
      minPassesToAdvance: DEFAULT_MULTISCALE_POLICY.minPassesToAdvance,
    },
  };
}

export function getStepPlanOrThrow(protocol: KitchenProtocol, stepNumber: number) {
  const step = protocolStepByNumber(protocol, stepNumber);
  if (!step) throw new Error(`Step ${stepNumber} not found for "${protocol.id}"`);
  return buildStepValidationPlan(protocol, step);
}

export function buildModeForValidationCheck(
  protocol: KitchenProtocol,
  step: ProtocolStep,
  validationCheck: MultiscaleValidationCheck,
): ERAnalysisMode {
  switch (validationCheck.modeId) {
    case "object-pointing":
      return step.requiredObjects?.length
        ? objectPointingMode(step.requiredObjects)
        : objectPointingMode(protocolInventoryNames(protocol));
    case "success-check":
      return successCheckMode(composeVerifyStepPrompt(step));
    case "vqa-annotation":
      return vqaAnnotationMode(protocol, step, buildStepVqaQuestions(protocol, step));
    case "safety-check":
      return safetyCheckMode(step.instruction);
    case "hand-tracking":
      return handTrackingMode();
    case "liquid-level":
      return liquidLevelMode(primaryLiquidContainer(step));
    case "instrument-read":
      return instrumentReadMode((step.instrumentReads || []).join(", ") || step.instruction);
    case "teacher-judgment":
      return buildTeacherJudgmentMode({
        protocolId: protocol.id,
        stepNumber: step.number,
        stepId: toClosedWorldStepId(protocol.id, step.number),
        step,
      });
    case "before-after":
      return beforeAfterMode(step.instruction);
    default:
      throw new Error(`Unsupported validation mode: ${validationCheck.modeId}`);
  }
}
