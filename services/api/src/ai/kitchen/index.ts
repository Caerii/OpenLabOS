/**
 * Kitchen Demo Module — LabOS's primary test workbench.
 *
 * Combines Gemini Robotics ER 1.6 capabilities with structured recipe
 * protocols for hands-free cooking guidance through smart glasses.
 *
 * Architecture:
 *   protocols.ts  — Recipe step definitions + ER verification prompts
 *   er-modes.ts   — Analysis mode factories (spatial, trajectory, instrument, etc.)
 *   tracker.ts    — Protocol progression state machine
 *   index.ts      — Barrel exports + initialization
 */

export { listProtocols, getProtocol, saveProtocol, deleteProtocol, loadUserProtocols } from "./protocols.js";
export type { KitchenProtocol, ProtocolStep } from "./protocols.js";
export {
  defaultWorkflowPreset,
  listWorkflowPresets,
  workflowPresetForProtocol,
} from "../workflows/index.js";
export type { LabOSWorkflowPreset } from "../workflows/index.js";

export {
  spatialInventoryMode,
  objectPointingMode,
  boundingBoxMode,
  trajectoryMode,
  instrumentReadMode,
  liquidLevelMode,
  successCheckMode,
  vqaAnnotationMode,
  beforeAfterMode,
  countingMode,
  workspaceClearMode,
  safetyCheckMode,
  handTrackingMode,
  nextStepGuidanceMode,
  getModeConfig,
  listAvailableModes,
} from "./er-modes.js";
export type { ERAnalysisMode } from "./er-modes.js";

export { protocolTracker, ProtocolTracker, KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE } from "./tracker.js";
export {
  buildProtocolMultiscalePlan,
  buildStepValidationPlan,
  aggregateMultiscaleEvidence,
  selectExecutableValidationChecks,
} from "./multiscale-validation.js";
export {
  evaluateAdherence,
  resetAdherencePolicyState,
} from "./adherence-policy.js";
export {
  attachKitchenNativeVideoArtifact,
  buildKitchenSessionManifest,
  buildKitchenSessionManifestFromArtifacts,
  saveKitchenSessionManifest,
} from "./session-manifest.js";
export {
  queueKitchenStepSegmentAnalysis,
  runKitchenStepSegmentAnalysis,
} from "./async-step-analysis.js";
export {
  analyzeSavedKitchenSessionManifest,
  queueSavedKitchenSessionManifestAnalysis,
} from "./saved-run-analysis.js";
export {
  annotateSavedKitchenSessionManifestVqa,
  queueSavedKitchenSessionManifestVqa,
  runSavedKitchenSegmentVqaAnnotation,
  runSavedKitchenSegmentVqaProbe,
} from "./saved-run-vqa.js";
export {
  runSavedRunVqaBenchmark,
  summarizeSavedRunVqaBenchmarkRows,
} from "./vqa-benchmark.js";
export type {
  SavedRunVqaBenchmarkArtifact,
  SavedRunVqaBenchmarkOptions,
  SavedRunVqaBenchmarkResult,
  SavedRunVqaBenchmarkRow,
  SavedRunVqaBenchmarkSummary,
} from "./vqa-benchmark.js";
export {
  runLiveAnnotationSim,
} from "./live-annotation-sim.js";
export type {
  LiveAnnotationSimArtifact,
  LiveAnnotationSimCheckRow,
  LiveAnnotationSimOptions,
  LiveAnnotationSimProfile,
  LiveAnnotationSimResult,
  LiveAnnotationSimSummary,
  LiveAnnotationSimTickRow,
} from "./live-annotation-sim.js";
export {
  analyzeSavedKitchenSessionBoundaries,
} from "./saved-run-boundary-analysis.js";
export type {
  SavedRunBoundaryAnalysis,
  SavedRunBoundaryProbe,
  SavedRunBoundarySuggestion,
} from "./saved-run-boundary-analysis.js";
export { buildKitchenCaptureReadiness } from "./capture-readiness.js";
export {
  listKitchenSessionManifests,
  readKitchenSessionManifestFile,
  summarizeKitchenMediaEvidence,
  enrichKitchenMediaEvidenceEntries,
  buildKitchenMediaEvidenceMapFromManifests,
} from "./evidence-store.js";
export {
  replayFixtureFromSessionManifest,
  runKitchenReplayFixture,
} from "./replay.js";
export type {
  AdherenceAction,
  AdherencePolicyDecision,
  AdherencePolicyState,
} from "./adherence-policy.js";
export type {
  AttachKitchenNativeVideoArtifactInput,
  BuildKitchenSessionManifestInput,
  KitchenSessionManifest,
} from "./session-manifest.js";
export type {
  KitchenStepAnalysisDecision,
  KitchenStepAnalysisRecord,
  KitchenStepAnalysisStatus,
} from "./step-analysis-types.js";
export type { KitchenSavedManifestSummary, KitchenStepSegment } from "./run-store.js";
export type {
  KitchenManifestLike,
  KitchenMediaEvidenceLink,
  KitchenMediaEvidenceManifestInput,
  KitchenMediaEvidenceSummary,
} from "./evidence-store.js";
export type { KitchenReplayFixture, KitchenReplayResult } from "./replay.js";
export type {
  MultiscaleDecision,
  MultiscaleEvidence,
  MultiscaleValidationCheck,
  ProtocolMultiscalePlan,
  StepValidationPlan,
  ValidationScale,
} from "./multiscale-validation.js";
export {
  buildStepVqaQuestions,
  normalizeStepVqaAnnotation,
  vqaAnnotationPrompt,
} from "./vqa-annotations.js";
export type {
  StepVqaAnnotation,
  StepVqaAnnotationRecord,
  StepVqaAnswer,
  StepVqaQuestion,
} from "./vqa-annotations.js";
export type {
  ProtocolRun,
  StepState,
  StepStatus,
  RunStatus,
  RunSummary,
  VerificationResult,
} from "./tracker.js";
