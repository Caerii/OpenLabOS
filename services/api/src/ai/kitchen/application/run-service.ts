import type { LabOSFeatureFlags } from "../../../config/features.js";
import { DEFAULT_MULTISCALE_POLICY } from "../multiscale-validation.js";
import type { KitchenProtocol } from "../protocols.js";
import type { KitchenRunEventType, KitchenStepSegment } from "../run-store.js";
import type { ProtocolRun, ProtocolTracker, RunSummary, StepState, VerificationResult } from "../tracker.js";
import {
  cleanupTerminalKitchenRunWithPorts,
  type KitchenTerminalCleanupResult,
} from "./terminal-cleanup.js";
import type { KitchenRecordingServiceApi } from "./recording-service.js";
import {
  KitchenStepSegmentServiceError,
  type KitchenStepSegmentServiceApi,
} from "./step-segment-service.js";

export class KitchenRunServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type RunEventRef = { id?: string; protocolId?: string } | null | undefined;
type LiveCoachStepPhase = "start" | "advance" | "resume";

export type KitchenRunServicePorts = {
  tracker: ProtocolTracker;
  getProtocol: (protocolId: string) => KitchenProtocol | null | undefined;
  featureFlags: () => LabOSFeatureFlags;
  recording: KitchenRecordingServiceApi;
  stepSegments: KitchenStepSegmentServiceApi;
  appendKitchenStepSegment: (segment: KitchenStepSegment) => Promise<void>;
  runAdherenceTick: (body: Record<string, unknown>) => Promise<unknown>;
  saveKitchenSessionManifest: (runId?: string) => Promise<{ manifestRef?: string }>;
  recordEvent: (
    type: KitchenRunEventType,
    run: RunEventRef,
    payload?: Record<string, unknown>,
    snapshotRun?: ProtocolRun | null,
  ) => void | Promise<void>;
  warmCamera: () => Promise<void>;
  stopRealtimeSupervisor: (reason: string) => void | Promise<void>;
  sendLiveCoachSetupContext: (run: ProtocolRun, protocol: KitchenProtocol) => Promise<void> | void;
  sendLiveCoachStepContext: (run: ProtocolRun, step: StepState, phase: LiveCoachStepPhase) => Promise<void> | void;
  sendLiveCoachRunCompleteContext: (run: ProtocolRun) => Promise<void> | void;
};

export interface BeginKitchenRunOptions {
  protocolId: string;
  suppressStepCoach?: boolean;
}

export interface StartKitchenSetupRunOptions {
  protocolId: string;
  suppressSetupCoach?: boolean;
}

export interface BeginKitchenRunResult {
  success: true;
  run: RunSummary | null;
  recording: unknown;
}

export interface StartKitchenRunResult {
  success: true;
  run: RunSummary | null;
}

export interface ConfirmKitchenStepOptions {
  validate?: boolean;
  captureFrame?: boolean;
  captureChunk?: boolean;
  requireNativeRecording?: boolean;
  stopRecordingForSegment?: boolean;
  notes?: string[];
  chunkWindowMs?: number;
  videoFps?: number;
  [key: string]: unknown;
}

export interface ConfirmKitchenStepResult {
  success: true;
  segment: KitchenStepSegment;
  validation: unknown | null;
  run: RunSummary | null;
  currentStep: { number: number; instruction: string } | null;
}

export interface UndoKitchenStepResult {
  success: true;
  run: RunSummary | null;
  currentStep: { number: number; instruction: string } | null;
  attempt?: ReturnType<ProtocolTracker["getCurrentStepAttempt"]>;
}

export interface ApplyKitchenStepEvidenceOptions {
  run: ProtocolRun;
  currentStep: StepState;
  verification?: VerificationResult | null;
  eventType?: KitchenRunEventType;
  eventPayload?: Record<string, unknown>;
  onRecorded?: () => Promise<void> | void;
}

export interface ApplyKitchenStepEvidenceResult {
  stepAdvanced: boolean;
  runCompleted: boolean;
  run: RunSummary | null;
  currentStep: { number: number; instruction: string } | null;
}

export interface ApplyKitchenWorkspaceCheckOptions {
  run: ProtocolRun;
  passed: boolean;
  missingItems: string[];
  detectedItems: string[];
  eventPayload?: Record<string, unknown>;
  suppressStepCoach?: boolean;
}

export interface ApplyKitchenWorkspaceCheckResult {
  success: true;
  passed: boolean;
  run: RunSummary | null;
  currentStep: { number: number; instruction: string } | null;
}

function protocolOrThrow(ports: KitchenRunServicePorts, protocolId: string) {
  const protocol = ports.getProtocol(protocolId);
  if (!protocol) throw new KitchenRunServiceError(`Protocol "${protocolId}" not found`, 404);
  return protocol;
}

function currentRunOrThrow(ports: KitchenRunServicePorts) {
  const run = ports.tracker.getCurrentRun();
  if (!run) throw new KitchenRunServiceError("No active run");
  return run;
}

function currentStepOrThrow(ports: KitchenRunServicePorts) {
  const currentStep = ports.tracker.getCurrentStep();
  if (!currentStep) throw new KitchenRunServiceError("No active step to verify");
  return currentStep;
}

function serializeStep(step: StepState | null) {
  return step ? { number: step.step.number, instruction: step.step.instruction } : null;
}

export class KitchenRunService {
  constructor(private readonly ports: KitchenRunServicePorts) {}

  async beginRun({ protocolId, suppressStepCoach = false }: BeginKitchenRunOptions): Promise<BeginKitchenRunResult> {
    let recording: unknown = null;

    try {
      recording = await this.ports.recording.startRunRecording(protocolId);
      await this.startSetupRun({ protocolId });
      await this.forceStartRun({ suppressStepCoach });
      return { success: true, run: this.ports.tracker.summary, recording };
    } catch (error) {
      await this.ports.recording.stopTerminalRecording("run_begin_failed").catch(() => {});
      throw error;
    }
  }

  async startSetupRun({
    protocolId,
    suppressSetupCoach = false,
  }: StartKitchenSetupRunOptions): Promise<StartKitchenRunResult> {
    const protocol = protocolOrThrow(this.ports, protocolId);
    const run = this.ports.tracker.startRun(protocolId);
    await this.ports.recordEvent("run_start", run, { protocolName: run.protocolName }, run);
    if (!suppressSetupCoach) {
      await this.ports.sendLiveCoachSetupContext(run, protocol);
    }
    return { success: true, run: this.ports.tracker.summary };
  }

  async forceStartRun(opts: {
    suppressStepCoach?: boolean;
    eventPayload?: Record<string, unknown>;
  } = {}): Promise<StartKitchenRunResult> {
    this.ports.tracker.forceStart();
    const startedRun = this.ports.tracker.getCurrentRun();
    const currentStep = this.ports.tracker.getCurrentStep();
    await this.ports.recordEvent("run_force_start", startedRun, opts.eventPayload, startedRun);

    if (!opts.suppressStepCoach && startedRun && currentStep) {
      await this.ports.sendLiveCoachStepContext(startedRun, currentStep, "start");
    }

    return { success: true, run: this.ports.tracker.summary };
  }

  async confirmStep(body: ConfirmKitchenStepOptions = {}): Promise<ConfirmKitchenStepResult> {
    const flags = this.ports.featureFlags();
    if (!flags.stepSegmentsEnabled) {
      throw new KitchenRunServiceError("Step segments are disabled. Set LABOS_STEP_SEGMENTS_ENABLED=true to capture step boundaries.");
    }
    if (body.validate === true && !flags.confirmStepValidationEnabled) {
      throw new KitchenRunServiceError(
        "Confirm-step validation is disabled. Set LABOS_CONFIRM_STEP_VALIDATION_ENABLED=true to validate on confirm.",
      );
    }

    const run = currentRunOrThrow(this.ports);
    const currentStep = currentStepOrThrow(this.ports);
    const segment = await this.captureConfirmStepSegment(body, run, currentStep);
    await this.ports.appendKitchenStepSegment(segment);

    const shouldValidate = flags.confirmStepValidationEnabled && body.validate !== false;
    await this.ports.recordEvent("confirm_step", run, {
      stepNumber: currentStep.step.number,
      segmentId: segment.id,
      frameRefs: segment.frameRefs,
      chunkRefs: segment.chunkRefs,
      nativeRecording: segment.nativeRecording,
      validationEnabled: flags.confirmStepValidationEnabled,
      validationRequested: shouldValidate,
    });

    const validation = shouldValidate
      ? await this.ports.runAdherenceTick({
          ...body,
          useRollingChunk: body.useRollingChunk !== false,
          chunkWindowMs: Number(body.chunkWindowMs) > 0
            ? Number(body.chunkWindowMs)
            : DEFAULT_MULTISCALE_POLICY.shortChunkSeconds * 1000,
          videoFps: Number(body.videoFps) > 0
            ? Number(body.videoFps)
            : DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
        })
      : null;

    const updatedRun = this.ports.tracker.getCurrentRun();
    const updatedStep = this.ports.tracker.getCurrentStep();
    return {
      success: true,
      segment,
      validation,
      run: this.ports.tracker.summary,
      currentStep: updatedRun?.status === "running" ? serializeStep(updatedStep) : null,
    };
  }

  async undoStep(reason?: string): Promise<UndoKitchenStepResult> {
    const run = this.ports.tracker.getCurrentRun();
    const beforeStep = this.ports.tracker.getCurrentStep();
    const undo = this.ports.tracker.undoLastStep(reason);
    const nextStep = this.ports.tracker.getCurrentStep();
    const updatedRun = this.ports.tracker.getCurrentRun();
    await this.ports.recordEvent("undo_step", run, {
      reason,
      changed: undo.changed,
      fromStepNumber: undo.fromStepNumber ?? beforeStep?.step.number,
      toStepNumber: undo.toStepNumber ?? nextStep?.step.number,
      attempt: undo.attempt,
    }, updatedRun);
    if (updatedRun?.status === "running" && nextStep) {
      await this.ports.sendLiveCoachStepContext(updatedRun, nextStep, "resume");
    }
    return {
      success: true,
      run: this.ports.tracker.summary,
      currentStep: serializeStep(nextStep),
      attempt: undo.attempt,
    };
  }

  async abortRun(reason?: string): Promise<{ success: true; cleanup: KitchenTerminalCleanupResult }> {
    const run = this.ports.tracker.getCurrentRun();
    this.ports.tracker.abortRun(reason);
    await this.ports.recordEvent("run_abort", run, { reason });
    await this.ports.stopRealtimeSupervisor("run_aborted");
    const cleanup = await this.cleanupTerminalRun({ runId: run?.id, reason: "run_aborted" });
    return { success: true, cleanup };
  }

  async pauseRun(): Promise<{ success: true; run: RunSummary | null }> {
    this.ports.tracker.pauseRun();
    const run = this.ports.tracker.getCurrentRun();
    await this.ports.recordEvent("run_pause", run, undefined, run);
    await this.ports.stopRealtimeSupervisor("run_paused");
    return { success: true, run: this.ports.tracker.summary };
  }

  async resumeRun(): Promise<{ success: true; run: RunSummary | null }> {
    this.ports.tracker.resumeRun();
    const run = this.ports.tracker.getCurrentRun();
    const currentStep = this.ports.tracker.getCurrentStep();
    await this.ports.recordEvent("run_resume", run, undefined, run);
    void this.ports.warmCamera().catch(() => {});
    if (run && currentStep) {
      await this.ports.sendLiveCoachStepContext(run, currentStep, "resume");
    }
    return { success: true, run: this.ports.tracker.summary };
  }

  async skipStep(): Promise<{ success: true; run: RunSummary | null }> {
    const run = this.ports.tracker.getCurrentRun();
    this.ports.tracker.skipStep();
    const nextStep = this.ports.tracker.getCurrentStep();
    const updatedRun = this.ports.tracker.getCurrentRun();
    await this.ports.recordEvent("skip_step", run);
    await this.afterStepProgression(updatedRun, nextStep);
    return { success: true, run: this.ports.tracker.summary };
  }

  async completeStep(): Promise<{ success: true; run: RunSummary | null }> {
    const run = this.ports.tracker.getCurrentRun();
    this.ports.tracker.manualComplete();
    const nextStep = this.ports.tracker.getCurrentStep();
    const updatedRun = this.ports.tracker.getCurrentRun();
    await this.ports.recordEvent("complete_step", run);
    await this.afterStepProgression(updatedRun, nextStep);
    return { success: true, run: this.ports.tracker.summary };
  }

  async applyStepEvidence({
    run,
    currentStep,
    verification = null,
    eventType = "verify_step",
    eventPayload,
    onRecorded,
  }: ApplyKitchenStepEvidenceOptions): Promise<ApplyKitchenStepEvidenceResult> {
    const activeRun = this.ports.tracker.getCurrentRun();
    const activeStep = this.ports.tracker.getCurrentStep();
    if (!activeRun || activeRun.id !== run.id) {
      throw new KitchenRunServiceError("No active matching run for step evidence");
    }
    if (activeRun.status !== "running") {
      throw new KitchenRunServiceError("Run must be running before step evidence can be applied");
    }
    if (!activeStep || activeStep.step.number !== currentStep.step.number) {
      throw new KitchenRunServiceError("Step evidence does not match the active step");
    }

    const beforeStatus = run.status;
    const beforeStepIndex = run.currentStepIndex;

    if (verification) {
      this.ports.tracker.recordVerification(verification);
    }

    const updatedRun = this.ports.tracker.getCurrentRun();
    const updatedStep = this.ports.tracker.getCurrentStep();
    await this.ports.recordEvent(eventType, run, eventPayload, updatedRun);
    await onRecorded?.();

    const stepAdvanced = Boolean(
      verification
      && updatedRun
      && (updatedRun.status !== beforeStatus || updatedRun.currentStepIndex !== beforeStepIndex),
    );

    if (stepAdvanced) {
      await this.afterStepProgression(updatedRun, updatedStep);
    }

    return {
      stepAdvanced,
      runCompleted: updatedRun?.status === "completed",
      run: this.ports.tracker.summary,
      currentStep: updatedRun?.status === "running" ? serializeStep(updatedStep) : null,
    };
  }

  async applyWorkspaceCheck({
    run,
    passed,
    missingItems,
    detectedItems,
    eventPayload,
    suppressStepCoach = false,
  }: ApplyKitchenWorkspaceCheckOptions): Promise<ApplyKitchenWorkspaceCheckResult> {
    const activeRun = this.ports.tracker.getCurrentRun();
    if (!activeRun || activeRun.id !== run.id) {
      throw new KitchenRunServiceError("No active matching run for workspace check");
    }

    this.ports.tracker.completeWorkspaceCheck({ passed, missingItems, detectedItems });
    const updatedRun = this.ports.tracker.getCurrentRun();
    const currentStep = this.ports.tracker.getCurrentStep();
    await this.ports.recordEvent("workspace_check", run, eventPayload, updatedRun);

    if (passed && !suppressStepCoach && updatedRun?.status === "running" && currentStep) {
      await this.ports.sendLiveCoachStepContext(updatedRun, currentStep, "start");
    }

    return {
      success: true,
      passed,
      run: this.ports.tracker.summary,
      currentStep: updatedRun?.status === "running" ? serializeStep(currentStep) : null,
    };
  }

  private async afterStepProgression(updatedRun: ProtocolRun | null, nextStep: StepState | null) {
    if (updatedRun?.status === "running" && nextStep) {
      await this.ports.sendLiveCoachStepContext(updatedRun, nextStep, "advance");
      await this.ensureRecordingForRunningStep(updatedRun);
      return;
    }
    if (updatedRun?.status === "completed") {
      await this.ports.sendLiveCoachRunCompleteContext(updatedRun);
      await this.cleanupTerminalRun({ runId: updatedRun.id, reason: "run_completed" });
    }
  }

  private async ensureRecordingForRunningStep(updatedRun: ProtocolRun) {
    await this.ports.recording.ensureRecordingForNextStep(updatedRun.protocolId);
  }

  private async cleanupTerminalRun(opts: {
    runId?: string | null;
    reason: "run_completed" | "run_aborted";
    saveManifest?: boolean;
  }): Promise<KitchenTerminalCleanupResult> {
    return cleanupTerminalKitchenRunWithPorts({
      stopNativeRecording: (reason) => this.ports.recording.stopTerminalRecording(reason),
      saveKitchenSessionManifest: this.ports.saveKitchenSessionManifest,
    }, opts);
  }

  private async captureConfirmStepSegment(
    body: ConfirmKitchenStepOptions,
    run: ProtocolRun,
    currentStep: StepState,
  ): Promise<KitchenStepSegment> {
    try {
      return await this.ports.stepSegments.captureConfirmedStep({
        run,
        currentStep,
        attempt: this.ports.tracker.getCurrentStepAttempt(),
        captureFrame: body.captureFrame !== false,
        captureChunk: body.captureChunk === true,
        requireNativeRecording: body.requireNativeRecording === true,
        stopRecordingForSegment: body.stopRecordingForSegment === true,
        notes: body.notes,
        chunkWindowMs: body.chunkWindowMs,
        videoFps: body.videoFps,
      });
    } catch (error: any) {
      if (error instanceof KitchenStepSegmentServiceError) {
        throw new KitchenRunServiceError(error.message, error.status);
      }
      throw error;
    }
  }
}
