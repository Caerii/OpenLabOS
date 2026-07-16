import { Btn } from "../../ui/index";
import { operatorFixNextTitle, operatorReadinessHeadline } from "../../../lib/operatorStatus";
import type { CheckItem } from "./types";

export function SetupFixNext({
  checks,
  readyCount,
  setupReady,
}: {
  checks: CheckItem[];
  readyCount: number;
  setupReady: boolean;
}) {
  if (setupReady) return null;

  const blocker =
    checks.find((c) => c.state === "blocked") ||
    checks.find((c) => c.state === "warn") ||
    checks.find((c) => c.state === "checking") ||
    null;

  if (!blocker) return null;

  return (
    <div className="labos-surface p-4">
      <div className="labos-eyebrow">{operatorReadinessHeadline(readyCount, checks.length)}</div>
      <h3 className="labos-title mt-1">{operatorFixNextTitle(blocker.label)}</h3>
      <p className="labos-body mt-2">{blocker.detail}</p>
      {blocker.action && (
        <div className="mt-4">
          <Btn
            variant="primary"
            size="sm"
            onClick={blocker.action.onClick}
            loading={blocker.action.loading}
            disabled={blocker.action.loading}
          >
            {blocker.action.label}
          </Btn>
        </div>
      )}
    </div>
  );
}
