import { Badge, Card, SectionLabel } from "../../ui/index";
import type { EntitySegmentationStatus, KitchenRealtimeSupervisorStatus } from "../../../api";

export function PerceptionStackCard({ segmentationStatus, supervisorStatus }: {
  segmentationStatus: EntitySegmentationStatus | null;
  supervisorStatus: KitchenRealtimeSupervisorStatus | null;
}) {
  const mode = segmentationStatus?.mode || "mock";
  const sidecarHealthy = segmentationStatus?.health?.ok;
  const color =
    mode === "sidecar"
      ? sidecarHealthy === false ? "red" : "green"
      : mode === "disabled"
        ? "yellow"
        : "blue";
  const label =
    mode === "sidecar"
      ? sidecarHealthy === false ? "sidecar offline" : "sidecar active"
      : mode === "disabled"
        ? "segmentation off"
        : "mock contract";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Perception Stack</SectionLabel>
          <p className="text-[11px] text-muted leading-relaxed">
            Adherence uses live frames, rolling video chunks, Gemini/ER judgments, and entity masks when the sidecar is active.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={color}>{label}</Badge>
          <Badge color={supervisorStatus?.running ? "green" : "gray"}>
            {supervisorStatus?.running ? "adherence polling" : "manual checks"}
          </Badge>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-border/15 bg-border/10 p-2">
          <div className="uppercase tracking-wide text-subtle">Entity layer</div>
          <div className="mt-1 text-fg">{mode}</div>
        </div>
        <div className="rounded-lg border border-border/15 bg-border/10 p-2">
          <div className="uppercase tracking-wide text-subtle">Backend</div>
          <div className="mt-1 text-fg">{segmentationStatus?.health?.backend || (mode === "mock" ? "mock" : "unknown")}</div>
        </div>
      </div>
      {segmentationStatus?.error && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">
          {segmentationStatus.error}
        </div>
      )}
      {mode === "mock" && (
        <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-[11px] text-blue-200">
          Mock mode proves the UI/API contract only. Use the RunPod sidecar for real object masks before relying on entity evidence.
        </div>
      )}
    </Card>
  );
}
