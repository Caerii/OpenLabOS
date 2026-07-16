import type {
  EntitySegmentationStatus,
  LiveCoachHealth,
  RunPodCostGuardStatus,
} from "../../../api";

export function perceptionLabel(status: EntitySegmentationStatus | null) {
  if (!status) return "checking";
  if (status.mode === "sidecar") return status.health?.ok === false ? "sidecar offline" : "real masks";
  if (status.mode === "disabled") return "disabled";
  return "mock contract";
}

export function runpodLabel(status: RunPodCostGuardStatus | null) {
  if (!status) return "checking";
  if (status.lifecycleConfigured) return "stop guard ready";
  if (status.inferenceConfigured) return "inference only";
  return "not configured";
}

export function voiceLabel(health: LiveCoachHealth | null) {
  if (!health) return "checking";
  if (health.configured) return `${health.model} via ${health.effectiveAudioRoute || health.audioRoute}`;
  return "static replay fallback";
}
