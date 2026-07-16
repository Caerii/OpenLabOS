/**
 * Active Kitchen run lifecycle, verification, and realtime supervisor calls.
 */

import { kitchenGet, kitchenHandsFreePost, kitchenOperatorPost, kitchenRunPost } from "./transport";
import type {
  ERInputOptions,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
  KitchenButtonConfirmStatus,
  KitchenOperatorActionResult,
  KitchenOperatorBeginResult,
  KitchenOperatorConfirmStepResult,
  KitchenOperatorReadiness,
  KitchenOperatorSavePackageResult,
  KitchenRealtimeSupervisorStatus,
  KitchenRunAdherenceResult,
  KitchenRunSummary,
  KitchenStepSegment,
  KitchenStepStatus,
  ValidationScale,
} from "./types";

export const kitchenRunStart = (protocolId: string) =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("start", { protocolId });

export const kitchenRunForceStart = (opts?: { suppressStepCoach?: boolean }) =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("force-start", opts || {});

export const kitchenRunBegin = (protocolId: string, opts?: { suppressStepCoach?: boolean }) =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary | null; recording: unknown }>(
    "begin",
    { protocolId, ...(opts || {}) },
  );

export const kitchenRunPause = () =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("pause");

export const kitchenRunResume = () =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("resume");

export const kitchenRunAbort = (reason?: string) =>
  kitchenRunPost<{ success: boolean }>("abort", { reason });

export const kitchenRunStatus = () =>
  kitchenGet<{
    active: boolean;
    run: KitchenRunSummary | null;
    currentStep: KitchenStepStatus | null;
    reviewStep?: KitchenStepStatus | null;
    protocol: { id: string; name: string; totalSteps: number } | null;
    sensorBridge: { connected: boolean; imuActive: boolean };
  }>("run/status");

export const kitchenRunHistory = () =>
  kitchenGet<{ runs: KitchenRunSummary[] }>("run/history");

export const kitchenRunDetail = (id: string) => kitchenGet<any>(`run/${id}`);

export const kitchenFeatures = () =>
  kitchenGet<{
    flags: LabOSFeatureFlags;
    effectiveFlags?: LabOSFeatureFlags;
    experience?: LabOSFeatureExperience;
  }>("features");

export const kitchenButtonConfirmStatus = () =>
  kitchenGet<KitchenButtonConfirmStatus>("button-confirm/status");

export const kitchenOperatorReadiness = () =>
  kitchenGet<KitchenOperatorReadiness>("operator/readiness");

export const kitchenOperatorBegin = (protocolId: string, opts?: { suppressStepCoach?: boolean }) =>
  kitchenOperatorPost<KitchenOperatorActionResult<KitchenOperatorBeginResult>>(
    "begin",
    { protocolId, ...(opts || {}) },
  );

export const kitchenOperatorConfirmStep = (opts?: {
  validate?: boolean;
  captureFrame?: boolean;
  captureChunk?: boolean;
  requireNativeRecording?: boolean;
  stopRecordingForSegment?: boolean;
  notes?: string[];
  scales?: ValidationScale[];
  maxChecks?: number;
  useRollingChunk?: boolean;
  chunkWindowMs?: number;
} & ERInputOptions) =>
  kitchenOperatorPost<KitchenOperatorActionResult<KitchenOperatorConfirmStepResult>>("confirm-step", opts || {});

export const kitchenOperatorAbort = (reason?: string) =>
  kitchenOperatorPost<KitchenOperatorActionResult<{ cleanup?: unknown }>>("abort", { reason });

export const kitchenOperatorSavePackage = (runId?: string) =>
  kitchenOperatorPost<KitchenOperatorActionResult<KitchenOperatorSavePackageResult>>(
    "save-package",
    runId ? { runId } : {},
  );

export const kitchenWorkspaceCheck = (modelId?: string) =>
  kitchenRunPost<{
    success: boolean;
    passed: boolean;
    missingItems: string[];
    detectedItems: string[];
    detections: any[];
    latencyMs: number;
  }>("workspace-check", { modelId });

export const kitchenVerifyStep = (modelId?: string) =>
  kitchenRunPost<{
    verification: any;
    stepAdvanced: boolean;
    runCompleted: boolean;
    currentStep: any;
    latencyMs: number;
  }>("verify-step", { modelId });

export const kitchenRunAdherenceTick = (opts?: {
  scales?: ValidationScale[];
  maxChecks?: number;
  useRollingChunk?: boolean;
  chunkWindowMs?: number;
} & ERInputOptions) =>
  kitchenRunPost<KitchenRunAdherenceResult>("adherence-tick", opts || {});

export const kitchenConfirmStep = (opts?: {
  validate?: boolean;
  captureFrame?: boolean;
  captureChunk?: boolean;
  requireNativeRecording?: boolean;
  stopRecordingForSegment?: boolean;
  notes?: string[];
  scales?: ValidationScale[];
  maxChecks?: number;
  useRollingChunk?: boolean;
  chunkWindowMs?: number;
} & ERInputOptions) =>
  kitchenRunPost<{
    success: boolean;
    segment: KitchenStepSegment;
    validation: KitchenRunAdherenceResult | null;
    run: KitchenRunSummary | null;
    currentStep: { number: number; instruction: string } | null;
  }>("confirm-step", opts || {});

export const kitchenRunSupervisorStatus = () =>
  kitchenGet<KitchenRealtimeSupervisorStatus>("run/supervisor/status");

export const kitchenRunSupervisorStart = (opts?: { intervalMs?: number; maxChecks?: number; immediate?: boolean }) =>
  kitchenRunPost<KitchenRealtimeSupervisorStatus>("supervisor/start", opts || {});

export const kitchenRunSupervisorStop = () =>
  kitchenRunPost<KitchenRealtimeSupervisorStatus>("supervisor/stop", {});

export const kitchenHandsFreeStart = (opts: {
  protocolId: string;
  glassesIp?: string;
  token?: string;
  wsUrl?: string;
  playback?: boolean;
  requireVoice?: boolean;
  supervisor?: { intervalMs?: number; maxChecks?: number; immediate?: boolean };
}) =>
  kitchenHandsFreePost<{
    success: boolean;
    run: KitchenRunSummary;
    status: unknown;
  }>("start", opts);

export const kitchenHandsFreeStatus = () =>
  kitchenGet<unknown>("hands-free/status");

export const kitchenHandsFreeStop = () =>
  kitchenHandsFreePost<{ success: boolean; status: unknown }>("stop", {});

export const kitchenSkipStep = () =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("skip-step");

export const kitchenCompleteStep = () =>
  kitchenRunPost<{ success: boolean; run: KitchenRunSummary }>("complete-step");

export const kitchenUndoStep = (reason?: string) =>
  kitchenRunPost<{
    success: boolean;
    run: KitchenRunSummary | null;
    currentStep: { number: number; instruction: string } | null;
    attempt?: { stepNumber: number; attemptNumber: number; attemptId: string; supersedesAttemptId?: string };
  }>("undo-step", { reason });
