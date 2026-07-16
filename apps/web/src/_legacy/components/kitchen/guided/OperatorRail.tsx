import { Badge, Btn, Icon } from "../../ui/index";
import type {
  KitchenProtocolSummary,
  KitchenRealtimeSupervisorStatus,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
} from "../../../api";
import { deriveLabOSExperience } from "../../../lib/labosExperience";
import { ICON } from "../icons";
import type { CheckItem, OperatorAction, OperatorSecondaryAction } from "./types";
import { deriveFeatureCapabilities } from "./model";

function RunwayStrip({
  readyCount,
  checkCount,
  isActive,
  progress,
  max,
  supervisor,
  completed,
  featureFlags,
  featureExperience,
}: {
  readyCount: number;
  checkCount: number;
  isActive: boolean;
  progress: number;
  max: number;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  completed: boolean;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience?: LabOSFeatureExperience | null;
}) {
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const realtimeEnabled = experience.capabilities.realtimeSupervisor;
  const steps = [
    { label: "Preflight", done: readyCount === checkCount, active: readyCount < checkCount },
    { label: "Run", done: !!isActive || completed, active: readyCount === checkCount && !isActive && !completed },
    {
      label: realtimeEnabled ? "Supervise" : "Confirm",
      done: realtimeEnabled ? !!supervisor?.running : completed,
      active: isActive && !completed,
    },
    { label: "Review", done: completed, active: false },
  ];

  return (
    <div className="oc-runway-strip">
      {steps.map((step) => (
        <div
          key={step.label}
          className="oc-runway-pill"
          data-done={step.done ? "true" : "false"}
          data-active={step.active ? "true" : "false"}
        >
          <div className="oc-runway-pill-label">{step.label}</div>
          <div className="oc-runway-pill-value">
            {step.label === "Preflight"
              ? `${readyCount}/${checkCount}`
              : step.label === "Run" && isActive
                ? `${progress}/${max}`
                : step.done
                  ? "Done"
                  : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SetupRow({ check }: { check: CheckItem }) {
  return (
    <div className="oc-setup-row">
      <div className="oc-setup-mark" data-state={check.state} aria-hidden>
        {check.state === "ready" ? "✓" : ""}
      </div>
      <div className="min-w-0 flex-1">
        <div className="oc-setup-label">{check.label}</div>
        <p className="oc-setup-detail">{check.detail}</p>
        {check.action ? (
          <Btn
            className="mt-2"
            size="xs"
            variant={check.state === "blocked" ? "primary" : "secondary"}
            loading={check.action.loading}
            onClick={check.action.onClick}
          >
            {check.action.label}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

/** Unified right rail — one card, clear sections. */
export function OperatorRail({
  checks,
  readyCount,
  setupReady,
  protocolId,
  protocols,
  isActive,
  run,
  currentStep,
  primaryAction,
  shouldStartRun,
  shouldStartSupervisor,
  busy,
  featureFlags,
  featureExperience,
  progress,
  max,
  supervisor,
  completed,
  secondaryActions,
  onSelectProtocol,
  onStartRun,
  onStartSupervisor,
  onConfirmStep,
}: {
  checks: CheckItem[];
  readyCount: number;
  setupReady: boolean;
  protocolId: string;
  protocols: KitchenProtocolSummary[];
  isActive: boolean;
  run: KitchenRunSummary | null;
  currentStep: KitchenStepStatus | null;
  primaryAction: OperatorAction;
  shouldStartRun: boolean;
  shouldStartSupervisor: boolean;
  busy: string;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience?: LabOSFeatureExperience | null;
  progress: number;
  max: number;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  completed: boolean;
  secondaryActions: OperatorSecondaryAction[];
  onSelectProtocol: (id: string) => void;
  onStartRun: (protocolId: string) => void;
  onStartSupervisor: () => void;
  onConfirmStep: () => void;
}) {
  const capabilities = deriveFeatureCapabilities(featureFlags);
  const simpleConfirmActive = isActive && run?.status === "running" && capabilities.stepSegments;

  return (
    <aside className="oc-rail-stack hidden lg:block">
      <div className="oc-rail-card">
        <details className="oc-rail-section oc-expandable group" open={!setupReady}>
          <summary className="oc-rail-section-head oc-expandable-trigger list-none">
            <span className="flex items-center gap-1.5">
              <span className="oc-expandable-chevron" aria-hidden />
              Preflight
            </span>
            <Badge color={setupReady ? "green" : "yellow"}>
              {readyCount}/{checks.length}
            </Badge>
          </summary>
          <div className="pt-0">
            {checks.map((check) => (
              <SetupRow key={check.id} check={check} />
            ))}
          </div>
        </details>

        <div className="oc-rail-section">
          <div className="oc-rail-section-head">
            <span className="flex items-center gap-1.5">
              <Icon d={ICON.play} size={13} className="text-good-fg" />
              Run controls
            </span>
            {isActive && run ? (
              <Badge color={run.status === "running" ? "green" : "yellow"}>{run.status}</Badge>
            ) : null}
          </div>

          <label className="block">
            <span className="oc-rail-label">Protocol</span>
            <select
              className="input w-full py-1.5 text-sm"
              value={protocolId}
              disabled={isActive}
              onChange={(e) => onSelectProtocol(e.target.value)}
            >
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {currentStep ? (
            <div className="labos-inset mt-3 p-2.5">
              <div className="oc-rail-label">Current step</div>
              <p className="mt-1 text-xs leading-relaxed text-fg">{currentStep.instruction}</p>
            </div>
          ) : null}

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

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Btn
              variant="secondary"
              size="sm"
              disabled={!shouldStartRun}
              loading={busy === "run" || busy === "supervisor"}
              onClick={() => protocolId && onStartRun(protocolId)}
            >
              Start run
            </Btn>
            {simpleConfirmActive ? (
              <Btn variant="secondary" size="sm" loading={busy === "confirm-step"} onClick={onConfirmStep}>
                Confirm step
              </Btn>
            ) : capabilities.realtimeSupervisor ? (
              <Btn
                variant="secondary"
                size="sm"
                disabled={!shouldStartSupervisor}
                loading={busy === "supervisor"}
                onClick={onStartSupervisor}
              >
                Supervisor
              </Btn>
            ) : (
              <Btn variant="secondary" size="sm" disabled>
                Manual
              </Btn>
            )}
          </div>

          {secondaryActions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/8 pt-3">
              {secondaryActions.map((action) => (
                <Btn
                  key={action.key}
                  variant={action.variant}
                  size="xs"
                  disabled={action.disabled || !action.onClick}
                  loading={action.loading}
                  onClick={action.onClick}
                >
                  {action.label}
                </Btn>
              ))}
            </div>
          ) : null}
        </div>

        <div className="oc-rail-section">
          <div className="oc-rail-section-head">
            <span>Journey</span>
          </div>
          <RunwayStrip
            readyCount={readyCount}
            checkCount={checks.length}
            isActive={isActive}
            progress={progress}
            max={max}
            supervisor={supervisor}
            completed={completed}
            featureFlags={featureFlags}
            featureExperience={featureExperience}
          />
        </div>
      </div>
    </aside>
  );
}
