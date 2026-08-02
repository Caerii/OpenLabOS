import { Badge, Btn, Card, SectionLabel } from "../../ui/index";
import type { KitchenRealtimeSupervisorStatus } from "../../../api";

export function SupervisorCard({ status, changing, onStart, onStop }: {
  status: KitchenRealtimeSupervisorStatus | null;
  changing: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const last = status?.lastResult;
  const action = last?.adherence.action.replace(/_/g, " ");
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Auto-check</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={status?.running ? "green" : "blue"}>{status?.running ? "running" : "idle"}</Badge>
            <span className="text-[11px] text-muted">
              {status?.tickCount ?? 0} checks
              {" · "}
              {status?.buffer.frameCount ?? 0} frames buffered
              {status?.buffer.approxFps ? ` @ ${status.buffer.approxFps.toFixed(1)} fps` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.running ? (
            <Btn variant="secondary" size="sm" loading={changing} onClick={onStop}>Stop auto-check</Btn>
          ) : (
            <Btn variant="primary" size="sm" loading={changing} onClick={onStart}>Start auto-check</Btn>
          )}
        </div>
      </div>
      {last && (
        <div className="mt-3 rounded-lg border border-border/15 bg-border/10 p-2 text-[11px] text-muted">
          Last: <span className="text-fg">{action}</span>
          {" · "}
          step advanced={String(last.stepAdvanced)}
          {" · "}
          confidence={Math.round((last.adherence.confidence || 0) * 100)}%
          <div className="mt-1">{last.adherence.spokenSummary}</div>
        </div>
      )}
      {status?.lastError && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">
          {status.lastError}
        </div>
      )}
    </Card>
  );
}
