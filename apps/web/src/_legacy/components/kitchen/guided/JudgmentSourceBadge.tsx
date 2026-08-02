import type {
  EntitySegmentationStatus,
  KitchenRunAdherenceResult,
  KitchenRealtimeSupervisorStatus,
  RunPodCostGuardStatus,
} from "../../../api";
import { providerIdFromModelId } from "../../../lib/labosModelRouting";
import { Badge, type BadgeColor } from "../../ui";

export interface JudgmentSourceSummary {
  label: string;
  detail: string;
  tone: BadgeColor;
}

export function deriveJudgmentSource({
  lastAdherence,
  supervisor,
  segmentation,
  runpodGuard,
}: {
  lastAdherence: KitchenRunAdherenceResult | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  segmentation: EntitySegmentationStatus | null;
  runpodGuard: RunPodCostGuardStatus | null;
}): JudgmentSourceSummary {
  const evidence = lastAdherence?.evidence || [];
  const modeIds = [...new Set(evidence.map((item) => item.modeId).filter(Boolean))];
  const primaryMode = modeIds[0] || "";
  const provider = primaryMode ? providerIdFromModelId(primaryMode) || primaryMode.split(":")[0] : "";

  if (provider === "mock" || primaryMode.includes("mock")) {
    return {
      label: "practice checks",
      detail: "Using repeatable sample results; no live check service is connected.",
      tone: "blue",
    };
  }

  if (runpodGuard?.inferenceConfigured) {
    const podHint = runpodGuard.podId ? `pod ${runpodGuard.podId}` : "RunPod inference";
    return {
      label: "remote step checks",
      detail: `${podHint}${primaryMode ? ` · ${primaryMode}` : ""}`,
      tone: "purple",
    };
  }

  if (segmentation?.mode === "sidecar" && segmentation.health?.ok !== false) {
    return {
      label: provider ? `${provider} with object detection` : "object detection",
      detail: `Object detection is active${primaryMode ? ` · ${primaryMode}` : ""}`,
      tone: "green",
    };
  }

  if (supervisor?.running) {
    return {
      label: provider ? `${provider} auto-check` : "auto-check",
      detail: `Automatic step checks are active${primaryMode ? ` · ${primaryMode}` : ""}`,
      tone: "green",
    };
  }

  if (primaryMode) {
    return {
      label: provider || primaryMode,
      detail: `Last check used ${primaryMode}`,
      tone: "gray",
    };
  }

  return {
    label: "no judgment yet",
    detail: "Start a run or select Check Now to see the active source.",
    tone: "gray",
  };
}

export function JudgmentSourceBadge({
  lastAdherence,
  supervisor,
  segmentation,
  runpodGuard,
  className = "",
}: {
  lastAdherence: KitchenRunAdherenceResult | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  segmentation: EntitySegmentationStatus | null;
  runpodGuard: RunPodCostGuardStatus | null;
  className?: string;
}) {
  const source = deriveJudgmentSource({ lastAdherence, supervisor, segmentation, runpodGuard });
  return (
    <span className={`inline-flex flex-col gap-0.5 ${className}`} title={source.detail}>
      <Badge color={source.tone}>{source.label}</Badge>
      <span className="text-[10px] text-subtle">{source.detail}</span>
    </span>
  );
}
