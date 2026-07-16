import {
  compactNativeRecordingStatus,
  nativeRecordingActive,
  stoppedNativeRecordingStatus,
  type NativeRecordingSnapshot,
} from "./recording-state.js";

export class KitchenRecordingServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface KitchenRecordingServicePorts {
  startNativeRecording: (protocolId?: string) => Promise<unknown>;
  stopNativeRecording: (reason?: string) => Promise<unknown>;
  refreshNativeRecordingStatus: () => Promise<unknown>;
}

export interface CaptureStepSegmentRecordingOptions {
  requireActive?: boolean;
  stopForSegment?: boolean;
}

export interface KitchenRecordingServiceApi {
  startRunRecording: (protocolId?: string) => Promise<unknown>;
  stopTerminalRecording: (reason?: string) => Promise<unknown>;
  ensureRecordingForNextStep: (protocolId?: string) => Promise<unknown | null>;
  captureStepSegmentRecording: (opts?: CaptureStepSegmentRecordingOptions) => Promise<NativeRecordingSnapshot>;
  statusSnapshot: () => Promise<NativeRecordingSnapshot>;
}

export class KitchenRecordingService implements KitchenRecordingServiceApi {
  constructor(private readonly ports: KitchenRecordingServicePorts) {}

  startRunRecording(protocolId?: string) {
    return this.ports.startNativeRecording(protocolId);
  }

  stopTerminalRecording(reason?: string) {
    return this.ports.stopNativeRecording(reason);
  }

  async ensureRecordingForNextStep(protocolId?: string) {
    const recordingStatus = await this.ports.refreshNativeRecordingStatus().catch(() => null);
    if (nativeRecordingActive(recordingStatus)) return null;
    return this.ports.startNativeRecording(protocolId);
  }

  async statusSnapshot() {
    const recordingStatus = await this.ports.refreshNativeRecordingStatus().catch(() => null);
    return compactNativeRecordingStatus(recordingStatus);
  }

  async captureStepSegmentRecording({
    requireActive = false,
    stopForSegment = false,
  }: CaptureStepSegmentRecordingOptions = {}) {
    if (stopForSegment) {
      const stopStatus = await this.ports.stopNativeRecording("step_segment_complete").catch((error) => {
        throw new KitchenRecordingServiceError(
          `Failed to stop native recording for this step segment: ${error?.message || error}`,
          502,
        );
      });
      if (requireActive && (stopStatus as any)?.alreadyStopped === true) {
        throw new KitchenRecordingServiceError("Native recording is not active for this step segment");
      }
      return stoppedNativeRecordingStatus(null, stopStatus);
    }

    const snapshot = await this.statusSnapshot();
    if (requireActive && !snapshot.active) {
      throw new KitchenRecordingServiceError("Native recording is not active for this step segment");
    }
    return snapshot;
  }
}
