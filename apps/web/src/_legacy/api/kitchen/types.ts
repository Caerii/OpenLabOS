/**
 * Shared browser-side contracts for the Kitchen workflow API.
 *
 * These types describe the payloads that cross the dashboard/server boundary.
 * UI state belongs in the Kitchen controller/components, not in this module.
 */

export interface KitchenProtocolSummary {
  id: string;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  stepCount: number;
  tags: string[];
}

export interface KitchenRunSummary {
  id: string;
  protocolId: string;
  protocolName: string;
  status: "idle" | "setup" | "running" | "paused" | "completed" | "aborted";
  currentStep: number;
  totalSteps: number;
  stepsCompleted: number;
  startedAt?: number;
  endedAt?: number;
  elapsedMs: number;
}

export interface KitchenStepStatus {
  number: number;
  instruction: string;
  status: string;
  attemptId?: string;
  attemptNumber?: number;
  supersedesAttemptId?: string;
  elapsedMs: number;
  verificationCount: number;
  lastVerification: any;
  requiredObjects: string[];
  hazardChecks?: string[];
  instrumentReads?: string[];
  spatialHint?: string;
}

export interface ERAnalysisResult {
  mode: string;
  raw: string;
  parsed: any;
  latencyMs: number;
}

export interface EntitySegmentationResult {
  provider: "mock" | "sidecar" | "disabled";
  configured: boolean;
  latencyMs: number;
  prompts: string[];
  observations: Array<{
    entityId: string;
    trackId?: string;
    label: string;
    confidence: number;
    box?: { format: "xyxy_pixel" | "er_yxyx_norm_1000"; value: [number, number, number, number] };
    mask?: { encoding: "coco_rle" | "polygon" | "png_base64"; [key: string]: unknown };
    centroid?: { x: number; y: number; coordinateFrame: "pixel" | "normalized_1000" };
    attributes?: Record<string, unknown>;
    source: string;
  }>;
  tracks: Array<{
    trackId: string;
    label: string;
    observationIds: string[];
    confidence: number;
    firstSeenAtMs?: number;
    lastSeenAtMs?: number;
  }>;
  summary: {
    objectsFound: string[];
    missingPrompts: string[];
    averageConfidence: number;
    hasMasks: boolean;
    hasTracks: boolean;
  };
  warnings: string[];
}

export interface EntitySegmentationStatus {
  mode: "mock" | "sidecar" | "disabled";
  configured: boolean;
  sidecarUrl?: string;
  authConfigured: boolean;
  health?: {
    ok: boolean;
    backend?: string;
    authRequired?: boolean;
  };
  error?: string;
}

export interface VideoAnalysisResult extends ERAnalysisResult {
  videoUrl: string;
  sources?: Array<{ web?: { uri: string; title?: string } }>;
}

export interface VideoProtocolResult extends VideoAnalysisResult {
  protocol: any;
  saved: boolean;
  savedPath?: string;
}

export interface ERInputOptions {
  modelId?: string;
  testImage?: string;
  testImageUrl?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  videoUrl?: string;
  videoStartOffsetSec?: number;
  videoEndOffsetSec?: number;
  videoFps?: number;
  useSearch?: boolean;
  thinkingLevel?: string;
}

export interface KitchenDemoSample {
  sampleId: string;
  sourceId: string;
  title: string;
  uploader: string;
  videoUrl: string;
  protocolId: string;
  recipe: string;
  stepHint: string;
  labelHint: string;
  split: string;
  clipStartSec: number;
  clipEndSec: number;
  clipDurationSec: number;
  targetFps: number;
  frameCount: number;
  previewVideoUrl?: string;
  frameUrls?: string[];
  originalVideoUrl?: string;
  notes?: string;
}

export type ValidationScale = "frame" | "short_chunk" | "step_window" | "session";

export interface MultiscaleValidationCheck {
  id: string;
  scale: ValidationScale;
  modeId: string;
  title: string;
  purpose: string;
  trigger: string;
  inputKinds: string[];
  priority: number;
  required: boolean;
  cadenceMs?: number;
}

export interface StepValidationPlan {
  protocolId: string;
  protocolName: string;
  stepNumber: number;
  stepId: string;
  instruction: string;
  successCriteria: string;
  requiredObjects: string[];
  checks: MultiscaleValidationCheck[];
  aggregation: {
    minCompletionConfidence: number;
    requireTemporalEvidence: boolean;
    blockOnUnsafeState: boolean;
  };
}

export interface ProtocolMultiscalePlan {
  protocolId: string;
  protocolName: string;
  workspaceChecks: MultiscaleValidationCheck[];
  stepPlans: StepValidationPlan[];
  sessionChecks: MultiscaleValidationCheck[];
  realtimePolicy: {
    frameSampleFps: number;
    defaultVideoFps: number;
    shortChunkSeconds: number;
    stepWindowSeconds: number;
    minPassesToAdvance: number;
  };
}

export interface MultiscaleValidationResult {
  success: boolean;
  plan: StepValidationPlan;
  selectedChecks: MultiscaleValidationCheck[];
  evidence: Array<{
    checkId: string;
    scale: ValidationScale;
    modeId: string;
    title: string;
    ok: boolean;
    passed?: boolean;
    confidence?: number;
    latencyMs?: number;
    parsed?: unknown;
    artifactRef?: string;
    artifactKind?: "frame" | "video_chunk";
    warnings: string[];
    blockers: string[];
    error?: string;
  }>;
  decision: {
    stepComplete: boolean;
    confidence: number;
    action: "advance" | "retry_frame" | "collect_short_chunk" | "manual_review";
    summary: string;
    supportingCheckIds: string[];
    warnings: string[];
    blockers: string[];
  };
}

export type AdherenceAction =
  | "advance"
  | "confirming"
  | "collect_more_evidence"
  | "possible_deviation"
  | "blocked";

export interface KitchenRunAdherenceResult extends MultiscaleValidationResult {
  adherence: {
    action: AdherenceAction;
    state: "watching" | "confirming" | "passed" | "recovering" | "blocked";
    confidence: number;
    shouldAdvance: boolean;
    shouldRecordVerification: boolean;
    reason: string;
    spokenSummary: string;
    recommendedNextScale?: ValidationScale;
    stateMemory: {
      consecutivePasses: number;
      consecutiveUncertain: number;
      consecutiveDeviations: number;
      lastAction: AdherenceAction | null;
      lastConfidence: number;
      updatedAt: number;
    };
  };
  verification: any | null;
  stepAdvanced: boolean;
  runCompleted: boolean;
  currentStep: { number: number; instruction: string } | null;
  frameRef?: string;
  rollingChunk?: {
    chunkRef: string;
    frameCount: number;
    durationMs: number;
    actualFps: number;
  } | null;
}

export interface KitchenRealtimeSupervisorStatus {
  enabled?: boolean;
  running: boolean;
  intervalMs: number;
  maxChecks: number;
  startedAt: number | null;
  stoppedAt: number | null;
  stopReason?: string;
  inFlight: boolean;
  tickCount: number;
  lastTickAt: number | null;
  lastError: string | null;
  lastResult: Pick<KitchenRunAdherenceResult, "adherence" | "stepAdvanced" | "runCompleted" | "currentStep"> | null;
  runId: string | null;
  stepNumber: number | null;
  buffer: {
    frameCount: number;
    newestFrameAt: number | null;
    oldestFrameAt: number | null;
    spanMs: number;
    totalBytes: number;
    approxFps: number;
  };
  previewTap: {
    running: boolean;
    startedAt: number | null;
    lastDataAt: number | null;
    reconnects: number;
    lastError: string | null;
  };
}

export interface KitchenButtonConfirmStatus {
  enabled: boolean;
  inFlight: boolean;
  totalHandled: number;
  lastResult: {
    handled: boolean;
    ignoredReason?: string;
    runId?: string;
    stepNumber?: number;
    completedManually?: boolean;
    timingsMs?: {
      ackDelay?: number;
      mapping?: number;
      confirm?: number;
      complete?: number;
      total?: number;
    };
    at: number;
  } | null;
  action: "protocol_confirm_step";
  sensorBridgeConnected: boolean;
  mappings: Record<string, string> | null;
  mapped: boolean;
  ready: boolean;
}

export type KitchenOperatorReadinessState = "ready" | "warn" | "blocked";

export type KitchenOperatorReadinessAction =
  | "connect_glasses"
  | "launch_labos"
  | "start_preview"
  | "set_button_confirm"
  | "reconnect_button"
  | "none";

export interface KitchenOperatorReadinessCheck {
  id: "glasses" | "labos" | "preview" | "recording" | "button-confirm" | "voice-perception";
  label: string;
  detail: string;
  state: KitchenOperatorReadinessState;
  blocking: boolean;
  recoveryAction: KitchenOperatorReadinessAction;
}

export interface KitchenOperatorReadiness {
  generatedAt: number;
  ready: boolean;
  checks: KitchenOperatorReadinessCheck[];
  blockers: KitchenOperatorReadinessCheck[];
  summary: {
    glassesConnected: boolean;
    labosReady: boolean;
    previewReady: boolean;
    recordingActive: boolean;
    buttonConfirmReady: boolean;
    operatorMode: LabOSFeatureFlags["protocolMode"] | "unknown";
  };
}

export interface KitchenOperatorActionResult<T = unknown> {
  success: true;
  readiness: KitchenOperatorReadiness;
  timingsMs: Record<string, number>;
  result: T;
}

export interface KitchenOperatorBeginResult {
  run: KitchenRunSummary | null;
  recording: unknown;
}

export interface KitchenOperatorConfirmStepResult {
  confirm: {
    success: boolean;
    segment: KitchenStepSegment;
    validation: KitchenRunAdherenceResult | null;
    run: KitchenRunSummary | null;
    currentStep: { number: number; instruction: string } | null;
  };
  completedManually: boolean;
  complete: unknown | null;
}

export interface KitchenOperatorSavePackageResult {
  manifestRef?: string;
  manifest?: KitchenSessionManifest;
  postRunVqa?: KitchenPostRunVqaAutoQueueResult;
}

export interface LabOSFeatureFlags {
  protocolMode: "manual" | "post_step_async" | "realtime_gated";
  stepSegmentsEnabled: boolean;
  captureStepChunksEnabled: boolean;
  confirmStepValidationEnabled: boolean;
  asyncStepAnalysisEnabled: boolean;
  buttonConfirmEnabled: boolean;
  realtimeSupervisorEnabled: boolean;
  handsFreeEnabled: boolean;
  fullAnnotationEnabled: boolean;
  liveVqaEnabled: boolean;
  postRunVqaEnabled: boolean;
  rollingEvidenceEnabled: boolean;
  adaptivePreviewEnabled: boolean;
  previewDuringRecordingDefault: boolean;
}

export interface LabOSFeatureExperience {
  profile: "operator" | "engineering";
  /** @deprecated Use `profile` — legacy clients may send `experimental`. */
  mode: "operator" | "engineering" | "experimental";
  configuredProfile: "operator" | "engineering" | "auto";
  /** @deprecated Use `configuredProfile` */
  configuredMode: "operator" | "engineering" | "experimental" | "auto";
  enabledExperiments: string[];
  surfaces: {
    operatorKitchen: boolean;
    operatorRunsLibrary: boolean;
    operatorCameraBasic: boolean;
    engineeringNavigation: boolean;
    engineeringDevTools: boolean;
    engineeringMaintenance: boolean;
    engineeringKitchenExpert: boolean;
    engineeringKitchenInstrumentation: boolean;
    engineeringPreviewInstrument: boolean;
    engineeringPerfLab: boolean;
    engineeringEvidenceTechnical: boolean;
    engineeringLiveCoach: boolean;
    advancedNavigation: boolean;
    developerTools: boolean;
    maintenanceActions: boolean;
    kitchenAdvancedHeader: boolean;
    kitchenAdvancedBadges: boolean;
    kitchenExpertTabs: boolean;
    kitchenSandbox: boolean;
    advancedEvidencePanel: boolean;
    technicalEvidenceRefs: boolean;
    liveCoach: boolean;
  };
}

export interface KitchenStepSegment {
  id: string;
  createdAt: string;
  runId: string;
  protocolId: string;
  protocolName?: string;
  stepNumber: number;
  attemptId?: string;
  attemptNumber?: number;
  supersedesAttemptId?: string;
  stepInstruction?: string;
  startedAt?: number;
  endedAt: number;
  durationMs?: number;
  source: "confirm-step" | "adherence-advance" | "manual-complete" | "skip-step";
  frameRefs: string[];
  chunkRefs: string[];
  nativeRecording?: {
    active: boolean;
    activeVideoPath?: string;
    lastVideoPath?: string;
    startedAt?: string | null;
    stoppedAt?: string | null;
    healthRecording?: boolean;
    healthActiveVideoPath?: string;
    healthLastVideoPath?: string;
  };
  notes?: string[];
}

export interface KitchenSavedManifestSummary {
  runId: string;
  manifestRef: string;
  savedAt: string;
  generatedAt?: string;
  protocolId?: string;
  protocolName?: string;
  status?: string;
  stepsCompleted?: number;
  totalSteps?: number;
  frameCount?: number;
  chunkCount?: number;
  stepSegmentCount?: number;
  nativeVideoCount?: number;
  redoneAttemptCount?: number;
  deviationCount?: number;
  stepAnalysisCount?: number;
  completedStepAnalysisCount?: number;
  vqaAnnotationCount?: number;
  readinessGrade?: string;
}

export interface KitchenRunCatalogSummary extends KitchenSavedManifestSummary {
  runNumber: number;
  completionRatio: number;
  statusBucket: "completed" | "running" | "partial";
}

export interface KitchenSavedManifestAnalysisQueueResult {
  runId: string;
  modelId: string;
  queuedSegmentCount: number;
  skippedSegmentCount: number;
  queuedStepNumbers: number[];
}

export interface KitchenSavedManifestVqaQueueResult {
  runId: string;
  modelId: string;
  queuedSegmentCount: number;
  skippedSegmentCount: number;
  queuedStepNumbers: number[];
}

export interface KitchenPostRunVqaAutoQueueResult {
  enabled: boolean;
  queued: boolean;
  reason?: string;
  runId?: string;
  modelId?: string;
  queuedSegmentCount?: number;
  skippedSegmentCount?: number;
  queuedStepNumbers?: number[];
  error?: string;
}

export interface KitchenStepAnalysisRecord {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  runId: string;
  protocolId: string;
  segmentId: string;
  attemptId?: string;
  attemptNumber?: number;
  stepNumber: number;
  modelId: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  evidenceRefs: string[];
  performedCorrectly?: boolean;
  confidence?: number;
  summary?: string;
  deviation?: string | null;
  visibleEvidence?: string[];
  missingEvidence?: string[];
  rawText?: string;
  error?: string;
}

export interface KitchenStepVqaQuestion {
  id: string;
  kind: "object_presence" | "step_completion" | "safety" | "state_read" | "evidence_quality";
  question: string;
  expectedAnswer?: "yes" | "no" | "uncertain";
  required: boolean;
}

export interface KitchenStepVqaAnswer {
  questionId: string;
  question: string;
  answer: "yes" | "no" | "uncertain";
  confidence: number;
  evidence: string[];
  objectRefs: string[];
  blockingIssue: string | null;
}

export interface KitchenStepVqaAnnotation {
  schemaVersion: "labos.vqa.step.v1";
  source?: "live" | "saved-run-batch";
  runId?: string;
  protocolId: string;
  stepNumber: number;
  stepId: string;
  instruction: string;
  segmentId?: string;
  attemptId?: string;
  attemptNumber?: number;
  modelId?: string;
  evidenceRefs?: string[];
  createdAt?: string;
  questions: KitchenStepVqaQuestion[];
  answers: KitchenStepVqaAnswer[];
  frameSummary: string;
  stepCompleteLikelihood: number;
  recommendedNext: "advance" | "continue" | "collect_more_evidence" | "manual_review";
  missingEvidence: string[];
}

export interface KitchenStepVqaAnnotationRecord {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  runId: string;
  protocolId: string;
  segmentId: string;
  attemptId?: string;
  attemptNumber?: number;
  stepNumber: number;
  modelId: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  evidenceRefs: string[];
  annotation?: KitchenStepVqaAnnotation;
  rawText?: string;
  error?: string;
}

export interface KitchenCaptureReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  requiredFor: "simple_demo" | "analysis_demo" | "partner_demo";
}

export interface KitchenCaptureReadiness {
  schemaVersion?: "labos.kitchen.capture-readiness.v2";
  grade: "not_ready" | "simple_demo_ready" | "analysis_ready" | "partner_ready";
  label: string;
  summary: string;
  checks: KitchenCaptureReadinessCheck[];
}

export interface KitchenSessionManifest {
  schemaVersion: "labos.kitchen.session-manifest.v1";
  generatedAt: string;
  run: {
    id: string;
    protocolId: string;
    protocolName: string;
    status: string;
    createdAt?: number;
    startedAt?: number;
    endedAt?: number;
    currentStepIndex?: number;
    metrics?: unknown;
  };
  captureContract: {
    primaryArtifact: "frame_sequence" | "native_rolling_video";
    frameRefRoot: string;
    temporalChunks: string;
    stepBoundaries?: string;
  };
  rollingEvidence?: {
    enabled: boolean;
    nativeVideoPaths: string[];
    markers: Array<{
      ts: number;
      markerType?: string;
      stepNumber?: number;
      videoPath?: string;
    }>;
  };
  desktopNativeVideoPaths?: string[];
  desktopNativeVideoArtifacts?: Array<{
    devicePath: string;
    artifactRef: string;
    importedAt: string;
    size?: number;
    sha256?: string;
    sourceDeviceSerial?: string;
    metadata?: {
      durationSec?: number;
      width?: number;
      height?: number;
      codecName?: string;
      avgFps?: number;
      bitRate?: number;
    };
    attachedStepNumber?: number;
    attachedAttemptId?: string;
  }>;
  validationCatalog?: {
    checks: unknown[];
  };
  steps: unknown[];
  stepAttempts?: Array<{
    attemptId: string;
    stepNumber: number;
    attemptNumber: number;
    supersedesAttemptId?: string;
    supersededByAttemptId?: string;
    segmentIds: string[];
    frameRefs: string[];
    chunkRefs: string[];
    nativeVideoPaths: string[];
    startedAt?: number;
    endedAt?: number;
    status: "current" | "superseded";
  }>;
  stepSegments?: KitchenStepSegment[];
  frames: Array<{ frameRef: string; stepNumber?: number; source: string }>;
  chunks: Array<{ chunkRef: string; stepNumber?: number; source: string; frameCount?: number; durationMs?: number; actualFps?: number }>;
  adherence: Array<{ ts: number; stepNumber?: number; action?: string; state?: string; confidence?: number; reason?: string }>;
  stepAnalyses?: KitchenStepAnalysisRecord[];
  vqaAnnotationRecords?: KitchenStepVqaAnnotationRecord[];
  vqaAnnotations?: KitchenStepVqaAnnotation[];
  readiness?: KitchenCaptureReadiness;
  events: unknown[];
  exportHints: {
    trainingRepoRawTarget: string;
    stableJoinKeys: string[];
  };
  nativeVideoArtifacts?: Record<string, {
    devicePath: string;
    name: string;
    ref: string;
    url: string;
    downloadUrl: string;
    status: "cached" | "pending" | "missing" | "error";
    size?: number;
    cachedAt?: string;
    error?: string;
  }>;
}

export interface KitchenNativeVideoArtifact {
  devicePath: string;
  name: string;
  ref: string;
  url: string;
  downloadUrl: string;
  status: "cached" | "pending" | "missing" | "error";
  size?: number;
  cachedAt?: string;
  error?: string;
}

export interface KitchenRunEvidenceStats {
  frameCount: number;
  chunkCount: number;
  stepSegmentCount: number;
  stepAnalysisCount: number;
  currentAttemptCount: number;
  redoneAttemptCount: number;
  nativeVideoCount: number;
  deviationCount: number;
  vqaAnnotationCount: number;
}

export interface KitchenRunEvidenceAnalysis {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  modelId: string;
  segmentId: string;
  performedCorrectly?: boolean;
  confidence?: number;
  summary?: string;
  deviation?: string | null;
  visibleEvidence: string[];
  missingEvidence: string[];
  error?: string;
  completedAt?: string;
}

export interface KitchenRunEvidenceVqaAnnotation {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  modelId: string;
  segmentId: string;
  stepCompleteLikelihood?: number;
  recommendedNext?: string;
  frameSummary?: string;
  answerCount: number;
  questionCount?: number;
  latencyMs?: number;
  evidenceRefs?: string[];
  answers?: KitchenStepVqaAnswer[];
  missingEvidence: string[];
  blockingIssues: string[];
  error?: string;
  completedAt?: string;
}

export interface KitchenRunEvidenceVideo {
  path: string;
  name: string;
  viewUrl: string;
  downloadUrl: string;
  deviceViewUrl: string;
  deviceDownloadUrl: string;
  thumbnailUrl?: string;
  segmentId?: string;
  durationMs?: number;
  source?: string;
  cacheStatus?: "cached" | "pending" | "missing" | "error";
  cacheSize?: number;
  cachedAt?: string;
  cacheError?: string;
}

export interface KitchenRunEvidenceAttempt {
  attemptId: string;
  stepNumber: number;
  attemptNumber: number;
  status: "current" | "superseded";
  instruction?: string;
  segmentIds: string[];
  snapshotRefs: string[];
  chunkRefs: string[];
  videos: KitchenRunEvidenceVideo[];
  analyses: KitchenRunEvidenceAnalysis[];
  vqaAnnotations: KitchenRunEvidenceVqaAnnotation[];
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
}

export interface KitchenRunLibrary {
  generatedAt: string;
  runs: KitchenRunCatalogSummary[];
}

export interface KitchenRunReview {
  generatedAt: string;
  run: KitchenRunCatalogSummary;
  manifest: KitchenSessionManifest;
  stats: KitchenRunEvidenceStats;
  attempts: KitchenRunEvidenceAttempt[];
}
