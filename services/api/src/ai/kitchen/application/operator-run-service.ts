import type { LabOSFeatureFlags } from "../../../config/features.js";
import type { OperatorReadiness } from "./operator-readiness.js";
import type {
  BeginKitchenRunOptions,
  BeginKitchenRunResult,
  ConfirmKitchenStepOptions,
  ConfirmKitchenStepResult,
} from "./run-service.js";

export interface OperatorRunServicePorts {
  featureFlags: () => LabOSFeatureFlags;
  ensureButtonConfirmBridge: () => Promise<unknown>;
  getOperatorReadiness: () => Promise<OperatorReadiness>;
  getCurrentRunId: () => string | undefined;
  runService: {
    beginRun: (opts: BeginKitchenRunOptions) => Promise<BeginKitchenRunResult>;
    confirmStep: (body?: ConfirmKitchenStepOptions) => Promise<ConfirmKitchenStepResult>;
    completeStep: () => Promise<unknown>;
    abortRun: (reason?: string) => Promise<{ success: true; cleanup?: unknown }>;
  };
  configureButtonConfirmForRun?: () => Promise<unknown>;
  restoreButtonConfirmAfterRun?: () => Promise<unknown>;
  saveKitchenSessionManifest: (runId?: string) => Promise<{
    manifestRef?: string;
    manifest?: unknown;
    [key: string]: unknown;
  }>;
}

export interface OperatorRunActionResult<T = unknown> {
  success: true;
  readiness: OperatorReadiness;
  timingsMs: Record<string, number>;
  result: T;
}

function elapsedSince(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

export function operatorConfirmStepOptions(
  flags: LabOSFeatureFlags,
  overrides: ConfirmKitchenStepOptions = {},
): ConfirmKitchenStepOptions {
  return {
    ...overrides,
    requireNativeRecording: overrides.requireNativeRecording ?? true,
    captureFrame: overrides.captureFrame ?? true,
    captureChunk: overrides.captureChunk ?? flags.captureStepChunksEnabled,
    stopRecordingForSegment: overrides.stopRecordingForSegment ?? true,
    validate: overrides.validate ?? flags.confirmStepValidationEnabled,
  };
}

export class KitchenOperatorRunService {
  constructor(private readonly ports: OperatorRunServicePorts) {}

  async beginRun(opts: BeginKitchenRunOptions): Promise<OperatorRunActionResult<{
    run: BeginKitchenRunResult["run"];
    recording: BeginKitchenRunResult["recording"];
  }>> {
    const timingsMs: Record<string, number> = {};
    const ensureStartedAt = Date.now();
    if (this.ports.featureFlags().buttonConfirmEnabled) {
      await this.ports.configureButtonConfirmForRun?.().catch(() => {});
      await this.ports.ensureButtonConfirmBridge().catch(() => {});
    }
    timingsMs.ensureButtonConfirmBridge = elapsedSince(ensureStartedAt);

    const beginStartedAt = Date.now();
    const begin = await this.ports.runService.beginRun(opts);
    timingsMs.beginRun = elapsedSince(beginStartedAt);

    return {
      success: true,
      readiness: await this.ports.getOperatorReadiness(),
      timingsMs,
      result: {
        run: begin.run,
        recording: begin.recording,
      },
    };
  }

  async confirmCurrentStep(body: ConfirmKitchenStepOptions = {}): Promise<OperatorRunActionResult<{
    confirm: ConfirmKitchenStepResult;
    completedManually: boolean;
    complete: unknown | null;
  }>> {
    const flags = this.ports.featureFlags();
    const timingsMs: Record<string, number> = {};

    const confirmStartedAt = Date.now();
    const confirm = await this.ports.runService.confirmStep(operatorConfirmStepOptions(flags, body));
    timingsMs.confirmStep = elapsedSince(confirmStartedAt);

    let complete: unknown | null = null;
    let completedManually = false;
    if (flags.protocolMode === "manual" && !(confirm.validation as any)?.stepAdvanced) {
      const completeStartedAt = Date.now();
      complete = await this.ports.runService.completeStep();
      timingsMs.completeStep = elapsedSince(completeStartedAt);
      completedManually = true;
    }

    if (confirm.run?.status === "completed" || (complete as any)?.run?.status === "completed") {
      await this.ports.restoreButtonConfirmAfterRun?.().catch(() => {});
    }

    return {
      success: true,
      readiness: await this.ports.getOperatorReadiness(),
      timingsMs,
      result: { confirm, completedManually, complete },
    };
  }

  async abortRun(reason?: string): Promise<OperatorRunActionResult<{
    cleanup?: unknown;
  }>> {
    const timingsMs: Record<string, number> = {};
    const abortStartedAt = Date.now();
    const aborted = await this.ports.runService.abortRun(reason);
    timingsMs.abortRun = elapsedSince(abortStartedAt);
    await this.ports.restoreButtonConfirmAfterRun?.().catch(() => {});
    return {
      success: true,
      readiness: await this.ports.getOperatorReadiness(),
      timingsMs,
      result: { cleanup: aborted.cleanup },
    };
  }

  async saveEvidencePackage(runId?: string): Promise<OperatorRunActionResult<{
    manifestRef?: string;
    manifest?: unknown;
  }>> {
    const targetRunId = runId || this.ports.getCurrentRunId();
    const timingsMs: Record<string, number> = {};
    const saveStartedAt = Date.now();
    const saved = await this.ports.saveKitchenSessionManifest(targetRunId);
    timingsMs.saveManifest = elapsedSince(saveStartedAt);
    await this.ports.restoreButtonConfirmAfterRun?.().catch(() => {});
    return {
      success: true,
      readiness: await this.ports.getOperatorReadiness(),
      timingsMs,
      result: {
        manifestRef: saved.manifestRef,
        manifest: saved.manifest,
      },
    };
  }
}
