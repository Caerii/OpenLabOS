import { Badge, Btn, Card, CardHeader, CardTitle, Icon } from "../../ui/index";
import { ICON } from "../icons";
import type { CheckItem, DemoReadiness } from "./types";

function readinessColor(state: DemoReadiness): "green" | "yellow" | "red" {
  if (state === "ready") return "green";
  if (state === "checking") return "yellow";
  if (state === "warn") return "yellow";
  return "red";
}

function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/10 bg-overlay/6 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${item.state === "ready" ? "bg-good-fg" : item.state === "checking" ? "animate-pulse bg-info-fg" : item.state === "warn" ? "bg-warn-fg" : "bg-bad-fg"}`} />
          <span className="text-sm font-medium text-fg">{item.label}</span>
          <Badge color={readinessColor(item.state)}>{item.state === "checking" ? "checking" : item.state}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted leading-relaxed">{item.detail}</p>
      </div>
      {item.action && (
        <Btn
          className="w-full sm:w-auto"
          size="sm"
          variant={item.state === "blocked" ? "primary" : "secondary"}
          loading={item.action.loading}
          onClick={item.action.onClick}
        >
          {item.action.label}
        </Btn>
      )}
    </div>
  );
}

export function PreflightPanel({ checks, readyCount }: { checks: CheckItem[]; readyCount: number }) {
  const allReady = readyCount === checks.length;
  const nextCheck = checks.find((check) => check.state !== "ready");

  return (
    <Card className="hidden lg:block">
      <details open={!allReady}>
        <summary className="list-none cursor-pointer">
          <CardHeader>
            <CardTitle
              icon={<Icon d={ICON.check} size={16} className="text-good-fg" />}
              sub={allReady ? "Ready. Collapse this and keep the run controls in focus." : nextCheck?.detail || "Finish setup before starting."}
            >
              Setup Check
            </CardTitle>
            <Badge color={allReady ? "green" : "yellow"}>{readyCount}/{checks.length}</Badge>
          </CardHeader>
        </summary>
        <div className="space-y-2">
          {checks.map((check) => <CheckRow key={check.id} item={check} />)}
        </div>
      </details>
    </Card>
  );
}

export function MobilePreflightDetails({ checks, readyCount }: { checks: CheckItem[]; readyCount: number }) {
  const allReady = readyCount === checks.length;
  const nextCheck = checks.find((check) => check.state !== "ready");

  return (
    <details className="labos-panel bg-surface-2 text-fg lg:hidden" open={!allReady}>
      <summary className="labos-panel-head cursor-pointer list-none">
        <span className="flex items-center justify-between gap-3">
          <span>{allReady ? "Setup complete" : "Setup"}</span>
          <span className="font-mono text-[10px] text-subtle">{readyCount}/{checks.length}</span>
        </span>
        {!allReady && nextCheck ? (
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted">
            {nextCheck.detail}
          </span>
        ) : null}
      </summary>
      <div className="labos-panel-body">
        {checks.map((check) => (
          <div key={check.id} className="oc-setup-row">
            <div className="oc-setup-mark" data-state={check.state} aria-hidden>
              {check.state === "ready" ? "✓" : ""}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">{check.label}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{check.detail}</p>
              {check.action ? (
                <Btn
                  className="mt-2 w-full"
                  size="sm"
                  variant={check.state === "blocked" ? "primary" : "secondary"}
                  loading={check.action.loading}
                  onClick={check.action.onClick}
                >
                  {check.action.label}
                </Btn>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
