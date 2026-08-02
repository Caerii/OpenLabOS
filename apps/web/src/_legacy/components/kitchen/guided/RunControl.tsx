import { Badge, Btn, Card, CardHeader, CardTitle, Icon } from "../../ui/index";
import type {
  KitchenProtocolSummary,
  KitchenRealtimeSupervisorStatus,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureFlags,
} from "../../../api";
import { ICON } from "../icons";
import type { OperatorAction, OperatorSecondaryAction } from "./types";
import { deriveFeatureCapabilities, featureFlagsOrDefault } from "./model";
import { runNaturalLabel, runReviewHref } from "../../files/runLibraryModel";

function CurrentStepCard({ currentStep }: { currentStep: KitchenStepStatus | null }) {
  return (
    <div className="labos-inset p-3">
      <div className="text-[11px] uppercase tracking-wide text-subtle">Current Step</div>
      {currentStep ? (
        <>
          <div className="mt-1 text-sm font-semibold text-fg">Step {currentStep.number}</div>
          <p className="mt-1 text-xs text-muted leading-relaxed">{currentStep.instruction}</p>
          {currentStep.requiredObjects?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {currentStep.requiredObjects.map((object) => <Badge key={object} color="blue">{object}</Badge>)}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">No active step yet.</p>
      )}
    </div>
  );
}

export function DesktopRunControl({
  protocolId,
  protocols,
  isActive,
  run,
  currentStep,
  primaryAction,
  savedManifestRef,
  shouldStartRun,
  shouldStartSupervisor,
  busy,
  featureFlags,
  onSelectProtocol,
  onStartRun,
  onStartSupervisor,
  onConfirmStep,
  secondaryActions,
  supervisor,
  savedRunNumber,
  className = "",
}: {
  protocolId: string;
  protocols: KitchenProtocolSummary[];
  isActive: boolean;
  run: KitchenRunSummary | null;
  currentStep: KitchenStepStatus | null;
  primaryAction: OperatorAction;
  savedManifestRef: string;
  shouldStartRun: boolean;
  shouldStartSupervisor: boolean;
  busy: string;
  featureFlags: LabOSFeatureFlags | null;
  onSelectProtocol: (id: string) => void;
  onStartRun: (protocolId: string) => void;
  onStartSupervisor: () => void;
  onConfirmStep: () => void;
  secondaryActions: OperatorSecondaryAction[];
  supervisor: KitchenRealtimeSupervisorStatus | null;
  savedRunNumber?: number;
  className?: string;
}) {
  const capabilities = deriveFeatureCapabilities(featureFlags);
  const flags = featureFlagsOrDefault(featureFlags);
  const simpleConfirmActive = isActive && run?.status === "running" && capabilities.stepSegments;
  const terminalReview = run?.status === "completed" || run?.status === "aborted";
  const showTechnicalRefs = capabilities.advancedEvidence;

  return (
    <Card padding="none" className={`hidden lg:block labos-panel !bg-surface-2 ${className}`}>
      <CardHeader>
        <CardTitle icon={<Icon d={ICON.play} size={16} className="text-good-fg" />} sub={capabilities.handsFree ? "Hands-free mode starts recording and automatic step checks" : "Manual mode records the run and moves forward when each step is confirmed"}>
          Run Control
        </CardTitle>
        {isActive && <Badge color={run?.status === "running" ? "green" : "yellow"}>{run?.status}</Badge>}
      </CardHeader>

      {terminalReview ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-xl border border-highlight-border/20 bg-highlight-bg/10 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-highlight">Saved Run</div>
            <p className="mt-1 text-xs text-muted">{primaryAction.detail}</p>
            {savedManifestRef ? (
              <>
                <a
                  className="mt-2 block rounded-lg border border-highlight-border/25 bg-surface-2/70 p-3 text-sm font-semibold text-accentText hover:text-highlight"
                  href={runReviewHref(run?.id)}
                >
                  Review {runNaturalLabel(savedRunNumber)}
                </a>
                {showTechnicalRefs && (
                <>
                <div className="mt-2 break-all rounded-lg border border-border/15 bg-surface-2/70 p-2 font-mono text-[11px] text-fg">
                  dashboard/data/{savedManifestRef}
                </div>
                {run?.id && (
                  <div className="mt-2 break-all rounded-lg border border-border/15 bg-surface-2/70 p-2 font-mono text-[11px] text-muted">
                    /api/kitchen/session/manifests/{run.id}
                  </div>
                )}
                </>
                )}
              </>
            ) : (
              <div className="mt-2 labos-callout-warn p-2 text-xs text-warn-fg">
                Save this run before starting another one.
              </div>
            )}
          </div>
          <div className="labos-inset p-3">
            <div className="text-[11px] uppercase tracking-wide text-subtle">Next Action</div>
            <Btn
              className="mt-3 w-full"
              variant="primary"
              size="md"
              disabled={primaryAction.disabled || !primaryAction.onClick}
              loading={primaryAction.loading}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Btn>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Protocol</span>
            <select
              className="mt-1 w-full rounded-lg border border-border/25 bg-surface-2 px-3 py-2 text-sm text-fg"
              value={protocolId}
              disabled={isActive}
              onChange={(event) => onSelectProtocol(event.target.value)}
            >
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>{protocol.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Btn
              variant="primary"
              size="md"
              disabled={!shouldStartRun}
              loading={busy === "run" || busy === "supervisor"}
              onClick={() => protocolId && onStartRun(protocolId)}
            >
              {capabilities.handsFree ? "Start Hands-Free Run" : "Start Protocol Run"}
            </Btn>
            {simpleConfirmActive && (!capabilities.realtimeSupervisor || flags.protocolMode === "manual") ? (
              <Btn
                variant="primary"
                size="md"
                loading={busy === "confirm-step"}
                onClick={onConfirmStep}
              >
                Confirm Step
              </Btn>
            ) : supervisor?.running ? (
              <Btn variant="secondary" size="md" loading={busy === "supervisor"} onClick={secondaryActions.find((action) => action.key === "stop-realtime")?.onClick}>
                Stop Auto-Check
              </Btn>
            ) : capabilities.realtimeSupervisor ? (
              <Btn
                variant="secondary"
                size="md"
                disabled={!shouldStartSupervisor}
                loading={busy === "supervisor"}
                onClick={onStartSupervisor}
              >
                Start Auto-Check
              </Btn>
            ) : (
              <Btn variant="secondary" size="md" disabled>
                Manual Mode
              </Btn>
            )}
          </div>

          {secondaryActions.some((action) => action.key !== "stop-realtime") && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {secondaryActions
                .filter((action) => action.key !== "stop-realtime")
                .map((action) => (
                  <Btn
                    key={action.key}
                    variant={action.variant}
                    size="sm"
                    disabled={action.disabled || !action.onClick}
                    loading={action.loading}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Btn>
                ))}
            </div>
          )}

          {!shouldStartRun && !isActive && (
            <div className="labos-callout-warn p-3 text-xs text-warn-fg">
              Finish the setup items above before starting the run.
            </div>
          )}
          {capabilities.realtimeSupervisor && shouldStartSupervisor && (
            <div className="labos-callout-info p-3 text-xs">
              The run is active. Start Auto-Check for hands-free step checks.
            </div>
          )}
        </div>

        <CurrentStepCard currentStep={currentStep} />
      </div>
      )}
    </Card>
  );
}
