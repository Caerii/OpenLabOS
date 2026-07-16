import { Badge, Btn, Card, ProgressBar, SectionLabel } from "../../ui/index";
import type { KitchenRunSummary, KitchenStepStatus } from "../../../api";

export function RunHeader({ run, protocolName, currentStep, onPause, onResume, onAbort }: {
  run: KitchenRunSummary | null;
  protocolName?: string;
  currentStep: KitchenStepStatus | null;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionLabel>Running</SectionLabel>
          <h3 className="text-base font-semibold text-fg">{protocolName || run?.protocolId}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={run?.status === "running" ? "green" : run?.status === "paused" ? "yellow" : "blue"}>{run?.status}</Badge>
          {run?.status === "running" && <Btn variant="secondary" size="xs" onClick={onPause}>Pause</Btn>}
          {run?.status === "paused" && <Btn variant="primary" size="xs" onClick={onResume}>Resume</Btn>}
          <Btn variant="danger" size="xs" onClick={onAbort}>Abort</Btn>
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted mb-2">
        <span>Step {currentStep?.number || 0} of {run?.totalSteps || 0}</span>
        <span>{run?.stepsCompleted || 0} completed</span>
      </div>
      <ProgressBar value={run?.stepsCompleted || 0} max={run?.totalSteps || 1} />
    </Card>
  );
}
