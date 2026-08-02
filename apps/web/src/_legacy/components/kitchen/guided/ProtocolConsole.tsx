import { Btn } from "../../ui/index";
import type {
  EntitySegmentationStatus,
  KitchenProtocolSummary,
  KitchenRealtimeSupervisorStatus,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
} from "../../../api";
import { deriveLabOSExperience } from "../../../lib/labosExperience";
import type { CheckItem, OperatorAction, OperatorSecondaryAction } from "./types";

function humanPhase(stageLabel: string, stepNumber?: number, stepTotal?: number) {
  if (stepNumber && stepTotal) return `Step ${stepNumber} of ${stepTotal}`;
  return stageLabel;
}

export function ProtocolStatusRail({
  protocolName,
  stageLabel,
  connected,
  previewReady,
  voiceReady,
  segmentation,
  supervisor,
  featureFlags,
  featureExperience,
  stepNumber,
  stepTotal,
  setupReady,
}: {
  protocolName: string;
  stageLabel: string;
  connected: boolean;
  previewReady: boolean;
  voiceReady: boolean;
  segmentation: EntitySegmentationStatus | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience?: LabOSFeatureExperience | null;
  stepNumber?: number;
  stepTotal?: number;
  setupReady?: boolean;
}) {
  const showAdvanced = deriveLabOSExperience(featureFlags, featureExperience).surfaces.kitchenAdvancedBadges;
  const inRun = !!(stepNumber && stepTotal);
  const progressPct = inRun && stepTotal ? Math.min(100, ((stepNumber - 1) / stepTotal) * 100) : 0;
  const phase = humanPhase(stageLabel, stepNumber, stepTotal);
  const phaseTone = stageLabel === "Setup" && !setupReady ? "warn" : inRun ? "active" : "idle";

  const signals: { label: string; tone: "good" | "warn" | "bad" | "idle" }[] = [
    { label: connected ? "Glasses connected" : "Glasses offline", tone: connected ? "good" : "bad" },
    { label: previewReady ? "Preview live" : "Preview needed", tone: previewReady ? "good" : "warn" },
  ];
  if (showAdvanced) {
    signals.push({ label: voiceReady ? "Voice ready" : "Voice idle", tone: voiceReady ? "good" : "idle" });
    signals.push({
      label: segmentation?.mode === "sidecar"
        ? segmentation.health?.ok === false ? "Object detection unavailable" : "Object detection ready"
        : "Object detection in sample mode",
      tone: segmentation?.mode === "sidecar" ? "good" : "idle",
    });
  }
  signals.push({
    label: supervisor?.running ? "Auto-checking" : "Manual mode",
    tone: supervisor?.running ? "good" : "idle",
  });

  return (
    <div className="oc-chapter" role="status" aria-live="polite">
      <div className="oc-chapter-row">
        <p className="oc-chapter-breadcrumb">
          <strong>{protocolName}</strong>
          <span aria-hidden> · </span>
          {inRun ? `Step ${stepNumber} of ${stepTotal}` : setupReady ? "Ready to run" : "Preparing session"}
        </p>
        <span className="oc-chapter-phase" data-tone={phaseTone}>
          {phase}
        </span>
      </div>
      {inRun ? (
        <>
          <div className="oc-chapter-track" aria-hidden>
            <div className="oc-chapter-track-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="oc-chapter-track-label">
            <span>Progress</span>
            <span>
              {stepNumber}/{stepTotal}
            </span>
          </div>
        </>
      ) : (
        <div className="oc-signals">
          {signals.map((signal) => (
            <span key={signal.label} className="oc-signal" data-tone={signal.tone}>
              {signal.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProtocolInstructionPanel({
  stageLabel,
  headline,
  detail,
  kicker,
  stepNumber,
  stepTotal,
}: {
  stageLabel: string;
  headline: string;
  detail?: string;
  kicker?: string;
  stepNumber?: number;
  stepTotal?: number;
}) {
  return (
    <article className="oc-instruction" aria-labelledby="oc-instruction-headline">
      <header className="oc-instruction-meta">
        <span className="oc-instruction-kicker">{kicker || stageLabel}</span>
        {stepNumber && stepTotal ? (
          <span className="oc-instruction-step">
            {stepNumber} of {stepTotal}
          </span>
        ) : null}
      </header>
      <h2 id="oc-instruction-headline" className="oc-instruction-headline">
        {headline}
      </h2>
      {detail ? <p className="oc-instruction-detail">{detail}</p> : null}
    </article>
  );
}

export function SetupChecklist({ checks }: { checks: CheckItem[] }) {
  return (
    <div className="labos-panel hidden bg-surface-2 lg:block">
      <div className="labos-panel-head">Setup</div>
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
    </div>
  );
}

export function ProtocolRunway({
  readyCount,
  checkCount,
  isActive,
  progress,
  max,
  run,
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
  run: KitchenRunSummary | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  completed: boolean;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience?: LabOSFeatureExperience | null;
}) {
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const realtimeEnabled = experience.capabilities.realtimeSupervisor;
  const steps = [
    {
      label: "Setup",
      detail: `${readyCount}/${checkCount} checks`,
      done: readyCount === checkCount,
      active: readyCount < checkCount,
    },
    {
      label: "Protocol",
      detail: run?.protocolName || "Awaiting start",
      done: !!isActive || completed,
      active: readyCount === checkCount && !isActive && !completed,
    },
    realtimeEnabled
      ? {
          label: "Auto-check",
          detail: supervisor?.running ? `${supervisor.tickCount || 0} checks` : "Standby",
          done: !!supervisor?.running,
          active: isActive && !supervisor?.running && !completed,
        }
      : {
          label: "Confirm",
          detail: isActive ? `${progress}/${max} steps` : "Manual confirmations",
          done: completed,
          active: isActive && !completed,
        },
    {
      label: "Review",
      detail: completed ? "Run ready to review" : "Save run",
      done: completed,
      active: isActive && !completed && progress >= max,
    },
  ];

  return (
    <div className="labos-panel hidden bg-surface-2 lg:block">
      <div className="labos-panel-head">Runway</div>
      <div className="labos-panel-body oc-runway">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className="oc-runway-step"
            data-active={step.active ? "true" : "false"}
            data-done={step.done ? "true" : "false"}
          >
            <div className="font-mono text-[10px] text-subtle">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <div className="text-sm font-medium text-fg">{step.label}</div>
              <div className="mt-0.5 text-[11px] text-muted">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProtocolPrimaryAction({
  stageLabel,
  primaryAction,
  secondaryActions,
}: {
  stageLabel: string;
  primaryAction: OperatorAction;
  secondaryActions: OperatorSecondaryAction[];
}) {
  return (
    <div className="labos-panel hidden bg-surface-2 lg:block">
      <div className="labos-panel-head">{stageLabel}</div>
      <div className="labos-panel-body space-y-2">
        {primaryAction.detail ? (
          <p className="text-xs leading-relaxed text-muted">{primaryAction.detail}</p>
        ) : null}
        <Btn
          variant="primary"
          size="md"
          disabled={primaryAction.disabled || !primaryAction.onClick}
          loading={primaryAction.loading}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Btn>
        {secondaryActions.length > 0 ? (
          <div className={`grid gap-2 ${secondaryActions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {secondaryActions.map((action) => (
              <Btn
                key={action.key}
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
        ) : null}
      </div>
    </div>
  );
}

export function instructionHeadlineFor({
  currentStep,
  defaultProtocol,
  primaryAction,
  run,
}: {
  currentStep: KitchenStepStatus | null;
  defaultProtocol: KitchenProtocolSummary | null;
  primaryAction: OperatorAction;
  run: KitchenRunSummary | null;
}) {
  if (currentStep) return currentStep.instruction;
  if (run?.status === "completed" || run?.status === "aborted") {
    return run.status === "completed" ? "Run complete — review the session log" : "Run stopped — review captured steps";
  }
  return defaultProtocol?.name || primaryAction.label;
}
