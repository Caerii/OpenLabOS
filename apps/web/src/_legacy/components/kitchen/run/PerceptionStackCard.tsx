import { Badge, Card, SectionLabel } from "../../ui/index";
import type { EntitySegmentationStatus, KitchenRealtimeSupervisorStatus } from "../../../api";

export function PerceptionStackCard({ segmentationStatus, supervisorStatus }: {
  segmentationStatus: EntitySegmentationStatus | null;
  supervisorStatus: KitchenRealtimeSupervisorStatus | null;
}) {
  const mode = segmentationStatus?.mode || "mock";
  const detectionHealthy = segmentationStatus?.health?.ok;
  const color =
    mode === "sidecar"
      ? detectionHealthy === false ? "red" : "green"
      : mode === "disabled"
        ? "yellow"
        : "blue";
  const label =
    mode === "sidecar"
      ? detectionHealthy === false ? "object detection offline" : "object detection online"
      : mode === "disabled"
        ? "object detection off"
        : "practice masks";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Object detection</SectionLabel>
          <p className="text-[11px] text-muted leading-relaxed">
            Step checks use live frames and short video clips. When object
            detection is online, entity masks can be attached to the same check.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={color}>{label}</Badge>
          <Badge color={supervisorStatus?.running ? "green" : "gray"}>
            {supervisorStatus?.running ? "auto-check on" : "manual checks"}
          </Badge>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-border/15 bg-border/10 p-2">
          <div className="uppercase tracking-wide text-subtle">Detection mode</div>
          <div className="mt-1 text-fg">
            {mode === "sidecar" ? "live service" : mode === "disabled" ? "off" : "mock"}
          </div>
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
          Mock mode proves the UI and API contract only. Run a real object-detection
          service before trusting entity evidence in review.
        </div>
      )}
    </Card>
  );
}
