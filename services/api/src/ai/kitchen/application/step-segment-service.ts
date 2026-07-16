import { DEFAULT_MULTISCALE_POLICY } from "../multiscale-validation.js";
import type { KitchenStepSegment } from "../run-store.js";
import type { ProtocolRun, StepAttemptRef, StepState } from "../tracker.js";
import {
  KitchenRecordingServiceError,
  type KitchenRecordingServiceApi,
} from "./recording-service.js";
import type { NativeRecordingSnapshot } from "./recording-state.js";

export class KitchenStepSegmentServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface KitchenStepSegmentServicePorts {
  recording: KitchenRecordingServiceApi;
  captureFrame: () => Promise<Buffer>;
  saveKitchenFrame: (frameBuffer: Buffer, opts?: { prefix?: string }) => Promise<string>;
  materializeRecentPreviewChunk: (opts: {
    runId: string;
    protocolId: string;
    stepNumber: number;
    windowMs: number;
    fps: number;
  }) => Promise<{ chunkRef?: string } | null>;
  now?: () => number;
  randomSuffix?: () => string;
}

export interface CaptureConfirmedStepSegmentOptions {
  run: ProtocolRun;
  currentStep: StepState;
  attempt?: StepAttemptRef | null;
  captureFrame?: boolean;
  captureChunk?: boolean;
  requireNativeRecording?: boolean;
  stopRecordingForSegment?: boolean;
  notes?: unknown;
  chunkWindowMs?: unknown;
  videoFps?: unknown;
}

export interface KitchenStepSegmentServiceApi {
  captureConfirmedStep: (opts: CaptureConfirmedStepSegmentOptions) => Promise<KitchenStepSegment>;
}

function numericOption(value: unknown, fallback: number) {
  const numericValue = Number(value);
  return numericValue > 0 ? numericValue : fallback;
}

function noteList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const notes = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return notes.length ? notes : undefined;
}

function safeRandomSuffix(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 12) || "segment";
}

export class KitchenStepSegmentService implements KitchenStepSegmentServiceApi {
  constructor(private readonly ports: KitchenStepSegmentServicePorts) {}

  async captureConfirmedStep({
    run,
    currentStep,
    attempt,
    captureFrame = true,
    captureChunk = false,
    requireNativeRecording = false,
    stopRecordingForSegment = false,
    notes,
    chunkWindowMs,
    videoFps,
  }: CaptureConfirmedStepSegmentOptions): Promise<KitchenStepSegment> {
    if (run.status !== "running") {
      throw new KitchenStepSegmentServiceError("Run must be running before a step can be confirmed");
    }

    const endedAt = this.now();
    const startedAt = currentStep.startedAt ?? run.startedAt ?? run.createdAt;
    const nativeRecording = await this.captureStepSegmentRecording({
      requireActive: requireNativeRecording,
      stopForSegment: stopRecordingForSegment,
    });

    const frameRefs = captureFrame
      ? [await this.captureFrameRef(run.id, currentStep.step.number)]
      : [];
    const chunkRefs = captureChunk
      ? await this.captureChunkRefs({
          runId: run.id,
          protocolId: run.protocolId,
          stepNumber: currentStep.step.number,
          chunkWindowMs,
          videoFps,
        })
      : [];

    return {
      id: this.stepSegmentId(run.id, currentStep.step.number, endedAt),
      createdAt: new Date(endedAt).toISOString(),
      runId: run.id,
      protocolId: run.protocolId,
      protocolName: run.protocolName,
      stepNumber: currentStep.step.number,
      attemptId: attempt?.attemptId,
      attemptNumber: attempt?.attemptNumber,
      supersedesAttemptId: attempt?.supersedesAttemptId,
      stepInstruction: currentStep.step.instruction,
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      source: "confirm-step",
      frameRefs,
      chunkRefs,
      nativeRecording,
      notes: noteList(notes),
    };
  }

  private async captureFrameRef(runId: string, stepNumber: number) {
    const frameBuffer = await this.ports.captureFrame();
    return this.ports.saveKitchenFrame(frameBuffer, {
      prefix: `segment-step${stepNumber}-${runId}`,
    });
  }

  private async captureChunkRefs(opts: {
    runId: string;
    protocolId: string;
    stepNumber: number;
    chunkWindowMs: unknown;
    videoFps: unknown;
  }) {
    const chunk = await this.ports.materializeRecentPreviewChunk({
      runId: opts.runId,
      protocolId: opts.protocolId,
      stepNumber: opts.stepNumber,
      windowMs: numericOption(opts.chunkWindowMs, DEFAULT_MULTISCALE_POLICY.shortChunkSeconds * 1000),
      fps: numericOption(opts.videoFps, DEFAULT_MULTISCALE_POLICY.defaultVideoFps),
    }).catch(() => null);

    return chunk?.chunkRef ? [chunk.chunkRef] : [];
  }

  private async captureStepSegmentRecording(opts: {
    requireActive: boolean;
    stopForSegment: boolean;
  }): Promise<NativeRecordingSnapshot> {
    try {
      return await this.ports.recording.captureStepSegmentRecording(opts);
    } catch (error: any) {
      if (error instanceof KitchenRecordingServiceError) {
        throw new KitchenStepSegmentServiceError(error.message, error.status);
      }
      throw error;
    }
  }

  private stepSegmentId(runId: string, stepNumber: number, now: number) {
    return [
      runId,
      `step${stepNumber}`,
      now,
      safeRandomSuffix(this.ports.randomSuffix?.() ?? Math.random().toString(36).slice(2, 8)),
    ].join("-");
  }

  private now() {
    return this.ports.now?.() ?? Date.now();
  }
}
