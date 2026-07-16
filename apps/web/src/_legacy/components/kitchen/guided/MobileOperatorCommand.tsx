import { Badge, Btn, Card, type BadgeColor } from "../../ui/index";
import type {
  KitchenProtocolSummary,
  KitchenRunSummary,
  KitchenStepStatus,
} from "../../../api";
import type { AdherenceDecision, CheckItem, OperatorAction, OperatorSecondaryAction } from "./types";
import { runNaturalLabel, runReviewHref } from "../../files/runLibraryModel";
import { terminalRunOperatorMessage, terminalRunStatusLabel } from "./completionCopy";

function adherenceTone(decision: AdherenceDecision | null): BadgeColor {
  if (decision?.action === "advance") return "green";
  if (decision?.action === "possible_deviation" || decision?.action === "blocked") return "red";
  if (decision) return "yellow";
  return "gray";
}

export function MobileOperatorCommand({
  stageLabel,
  primaryAction,
  defaultProtocol,
  protocolId,
  protocols,
  currentStep,
  run,
  savedManifestRef,
  decision,
  nextCheck,
  isActive,
  showTechnicalRefs,
  secondaryActions,
  onSelectProtocol,
  savedRunNumber,
  className = "",
}: {
  stageLabel: string;
  primaryAction: OperatorAction;
  defaultProtocol: KitchenProtocolSummary | null;
  protocolId: string;
  protocols: KitchenProtocolSummary[];
  currentStep: KitchenStepStatus | null;
  run: KitchenRunSummary | null;
  savedManifestRef: string;
  decision: AdherenceDecision | null;
  nextCheck: CheckItem | null;
  isActive: boolean;
  showTechnicalRefs: boolean;
  secondaryActions: OperatorSecondaryAction[];
  onSelectProtocol: (id: string) => void;
  savedRunNumber?: number;
  className?: string;
}) {
  const terminalReview = run?.status === "completed" || run?.status === "aborted";
  const cardLabel = terminalReview
    ? "Run review"
    : currentStep
      ? `Current: Step ${currentStep.number} of ${run?.totalSteps || "?"}`
      : "Selected protocol";
  const cardText = terminalReview
    ? terminalRunOperatorMessage(run, savedManifestRef)
    : currentStep
      ? currentStep.instruction
      : defaultProtocol?.name || "No protocol loaded";

  return (
    <Card className={`lg:hidden labos-panel !bg-surface-2 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="oc-instruction-kicker">Operator command</div>
          <h3 className="oc-instruction-text text-lg">{stageLabel}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{primaryAction.detail}</p>
        </div>
        <Badge color={stageLabel === "Hands-free" || stageLabel === "Ready" ? "green" : stageLabel === "Setup" ? "yellow" : "blue"}>
          {stageLabel}
        </Badge>
      </div>

      <div className="mt-4 rounded-xl border border-border/15 bg-surface-2/70 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-subtle">
              {cardLabel}
            </div>
            <div className="mt-1 text-sm font-semibold text-fg">
              {terminalReview ? terminalRunStatusLabel(run) : cardText}
            </div>
            {terminalReview && <p className="mt-1 text-xs text-muted leading-relaxed">{cardText}</p>}
          </div>
          {decision && <Badge color={adherenceTone(decision)}>{decision.action.replace(/_/g, " ")}</Badge>}
        </div>
        {!terminalReview && currentStep?.requiredObjects?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {currentStep.requiredObjects.map((object) => <Badge key={object} color="blue">{object}</Badge>)}
          </div>
        ) : null}
        {decision?.spokenSummary && (
          <p className="mt-2 rounded-lg border border-border/15 bg-border/10 p-2 text-xs text-muted leading-relaxed">
            {decision.spokenSummary}
          </p>
        )}
      </div>

      {savedManifestRef && (
        <div className="mt-3 rounded-lg border border-highlight-border/20 bg-highlight-bg/10 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-highlight">Saved Evidence</div>
          <a className="mt-2 block rounded-lg border border-highlight-border/25 bg-surface-2/70 p-3 text-sm font-semibold text-accentText" href={runReviewHref(run?.id)}>
            Review {runNaturalLabel(savedRunNumber)}
          </a>
          {showTechnicalRefs ? (
            <>
              <div className="mt-1 break-all font-mono text-[11px] text-fg">dashboard/data/{savedManifestRef}</div>
              {run?.id && (
                <div className="mt-1 break-all font-mono text-[11px] text-muted">/api/kitchen/session/manifests/{run.id}</div>
              )}
            </>
          ) : null}
        </div>
      )}

      {nextCheck && !isActive && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-warn-fg">
          Next setup item: <span className="font-semibold">{nextCheck.label}</span>. {nextCheck.detail}
        </div>
      )}

      <details className="mt-3 rounded-lg border border-border/15 bg-border/10">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fg">
          Protocol: {defaultProtocol?.name || "none"}
        </summary>
        <div className="border-t border-border/15 p-3">
          <select
            className="w-full rounded-lg border border-border/25 bg-surface-2 px-3 py-2 text-sm text-fg"
            value={protocolId}
            disabled={isActive}
            onChange={(event) => onSelectProtocol(event.target.value)}
          >
            {protocols.map((protocol) => (
              <option key={protocol.id} value={protocol.id}>{protocol.name}</option>
            ))}
          </select>
        </div>
      </details>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <Btn
          className="w-full"
          variant="primary"
          size="md"
          disabled={primaryAction.disabled || !primaryAction.onClick}
          loading={primaryAction.loading}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Btn>
        {secondaryActions.length > 0 && (
          <div className={`grid gap-2 ${secondaryActions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {secondaryActions.map((action) => (
              <Btn
                key={action.key}
                className="w-full"
                variant={action.variant}
                size="sm"
                disabled={action.disabled || !action.onClick}
                loading={action.loading}
                onClick={action.onClick}
              >
                {action.key === "redo-previous-step" ? "Redo Previous" : action.label}
              </Btn>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
