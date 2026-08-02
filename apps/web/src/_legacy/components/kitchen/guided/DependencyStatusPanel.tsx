import { usePolling } from "../../../hooks/usePolling";
import { apiReadyz } from "../../../api/readiness";
import { Badge } from "../../ui";

function statusTone(ok: boolean | undefined): "green" | "yellow" | "red" {
  if (ok === true) return "green";
  if (ok === false) return "red";
  return "yellow";
}

function DependencyRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | undefined;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-border/15 bg-border/10 px-2.5 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium text-fg">{label}</div>
        {detail ? <div className="mt-0.5 text-[11px] text-muted">{detail}</div> : null}
      </div>
      <Badge color={statusTone(ok)}>
        {ok === true ? "healthy" : ok === false ? "unavailable" : "checking"}
      </Badge>
    </div>
  );
}

export function DependencyStatusPanel({
  compact = false,
  pollMs = 15_000,
}: {
  compact?: boolean;
  pollMs?: number;
}) {
  const { data, error, loading } = usePolling(apiReadyz, pollMs);

  const inferenceOk = data?.checks?.inference?.ok;
  const perceptionOk = data?.checks?.perception?.ok;
  const allReady = data?.ready === true;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]" role="status" aria-live="polite">
        <Badge color={statusTone(inferenceOk)}>step checks {inferenceOk ? "ready" : inferenceOk === false ? "unavailable" : "…"}</Badge>
        <Badge color={statusTone(perceptionOk)}>object detection {perceptionOk ? "ready" : perceptionOk === false ? "unavailable" : "…"}</Badge>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border/15 bg-surface-2 p-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Service Status</div>
        <Badge color={allReady ? "green" : loading && !data ? "gray" : "yellow"}>
          {loading && !data ? "checking" : allReady ? "ready" : "degraded"}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Live status for the services used during automatic checks.
      </p>
      <div className="mt-2 space-y-2">
        <DependencyRow
          label="Step-check service"
          ok={inferenceOk}
          detail={inferenceOk ? "Step checks are ready." : inferenceOk === false ? "Step checks are unavailable." : undefined}
        />
        <DependencyRow
          label="Object detection"
          ok={perceptionOk}
          detail={perceptionOk ? "Object detection is ready." : perceptionOk === false ? "Object detection is unavailable." : undefined}
        />
      </div>
      {error ? <div className="mt-2 text-[11px] text-red-400">Could not check service status: {error}</div> : null}
    </section>
  );
}
