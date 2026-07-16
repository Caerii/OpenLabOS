import { Btn } from "../../ui/index";
import type { CheckItem } from "./types";

/** Compact setup hint — editorial tone, never overlays the POV. */
export function SetupHintBanner({
  checks,
  readyCount,
  connected,
}: {
  checks: CheckItem[];
  readyCount: number;
  connected: boolean;
}) {
  const allReady = readyCount === checks.length;
  if (allReady) return null;

  const nextCheck = checks.find((c) => c.state === "blocked") || checks.find((c) => c.state !== "ready");
  const needsGlasses = !connected || nextCheck?.id === "glasses";

  return (
    <details className="oc-setup-hint oc-expandable labos-panel bg-surface-2 text-fg lg:hidden">
      <summary className="oc-setup-hint-summary oc-expandable-trigger list-none">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="oc-setup-hint-progress" aria-hidden>
            {readyCount}/{checks.length}
          </span>
          <div className="min-w-0">
            <p className="oc-setup-hint-title">
              {needsGlasses
                ? "Connect your glasses first"
                : nextCheck?.label || "A few things before you start"}
            </p>
            <p className="oc-setup-hint-lede">
              {needsGlasses
                ? "Use the connection bar above — then expand this checklist if you need it."
                : nextCheck?.detail || "Expand for the full preflight list."}
            </p>
          </div>
        </div>
        <span className="oc-setup-hint-toggle">
          <span className="oc-expandable-label">Details</span>
        </span>
      </summary>
      <div className="oc-setup-hint-body">
        {checks.map((check) => (
          <div key={check.id} className="oc-setup-row">
            <div className="oc-setup-mark" data-state={check.state} aria-hidden>
              {check.state === "ready" ? "✓" : ""}
            </div>
            <div className="min-w-0 flex-1">
              <div className="oc-setup-label">{check.label}</div>
              <p className="oc-setup-detail">{check.detail}</p>
              {check.action ? (
                <Btn
                  className="mt-2"
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
