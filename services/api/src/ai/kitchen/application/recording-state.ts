import type { KitchenStepSegment } from "../run-store.js";

export type NativeRecordingSnapshot = NonNullable<KitchenStepSegment["nativeRecording"]>;

export function compactNativeRecordingStatus(status: any): NativeRecordingSnapshot {
  const state = status?.state || {};
  const health = status?.health || {};
  return {
    active: state.active === true || health.recording === true,
    activeVideoPath: state.activeVideoPath || undefined,
    lastVideoPath: state.lastVideoPath || undefined,
    startedAt: state.startedAt ?? undefined,
    stoppedAt: state.stoppedAt ?? undefined,
    healthRecording: typeof health.recording === "boolean" ? health.recording : undefined,
    healthActiveVideoPath: health.activeVideoPath || undefined,
    healthLastVideoPath: health.lastVideoPath || undefined,
  };
}

export function nativeRecordingActive(status: unknown) {
  return compactNativeRecordingStatus(status).active;
}

export function stoppedNativeRecordingStatus(
  beforeStatus: unknown,
  stopStatus: unknown,
): NativeRecordingSnapshot {
  const before = compactNativeRecordingStatus(beforeStatus);
  const after = compactNativeRecordingStatus(stopStatus);
  return {
    ...before,
    ...after,
    active: after.active,
    activeVideoPath: after.active ? after.activeVideoPath || before.activeVideoPath : undefined,
    lastVideoPath: after.lastVideoPath
      || after.healthLastVideoPath
      || before.lastVideoPath
      || before.healthLastVideoPath
      || before.activeVideoPath
      || before.healthActiveVideoPath,
    startedAt: before.startedAt ?? after.startedAt,
    stoppedAt: after.stoppedAt ?? before.stoppedAt,
    healthRecording: after.healthRecording ?? before.healthRecording,
  };
}
