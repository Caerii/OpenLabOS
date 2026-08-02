import { Badge, Btn, Card, ProgressBar, SectionLabel } from "../../ui/index";
import type {
  EntitySegmentationStatus,
  KitchenRealtimeSupervisorStatus,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
} from "../../../api";
import { deriveLabOSExperience } from "../../../lib/labosExperience";
import type { CheckItem, OperatorAction } from "./types";

function MiniStep({ active, done, label, detail }: {
  active?: boolean;
  done?: boolean;
  label: string;
  detail: string;
}) {
  const tone = done ? "border-highlight-border/25 bg-highlight-bg/8" : active ? "border-info-border/25 bg-info-bg/8" : "border-border/15 bg-border/10";
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${done ? "bg-good-fg" : active ? "bg-blue-400" : "bg-border"}`} />
        <span className="text-xs font-semibold text-fg">{label}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted leading-relaxed">{detail}</p>
    </div>
  );
}

export function DemoHero({
  connected,
  previewReady,
  voiceReady,
  segmentation,
  supervisor,
  featureFlags,
  featureExperience,
}: {
  connected: boolean;
  previewReady: boolean;
  voiceReady: boolean;
  segmentation: EntitySegmentationStatus | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience?: LabOSFeatureExperience | null;
}) {
  const showAdvancedBadges = deriveLabOSExperience(featureFlags, featureExperience).surfaces.kitchenAdvancedBadges;

  return (
    <Card className="overflow-hidden !bg-gradient-to-br !from-surface-2 !via-surface-2 !to-highlight-bg/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <SectionLabel>Guided Kitchen Demo</SectionLabel>
          <h3 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            Step-by-step protocol run for the glasses
          </h3>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            The default flow keeps the operator on the current instruction and records each confirmed step for review.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Badge color={connected ? "green" : "red"}>{connected ? "glasses online" : "glasses offline"}</Badge>
          <Badge color={previewReady ? "green" : "yellow"}>{previewReady ? "frames live" : "preview needed"}</Badge>
          {showAdvancedBadges && <Badge color={voiceReady ? "green" : "yellow"}>{voiceReady ? "voice live" : "voice replay"}</Badge>}
          {showAdvancedBadges && (
            <Badge color={segmentation?.mode === "sidecar" ? "green" : "blue"}>
              {segmentation?.mode === "sidecar"
                ? segmentation.health?.ok === false ? "object detection unavailable" : "object detection ready"
                : "object detection sample mode"}
            </Badge>
          )}
          <Badge color={supervisor?.running ? "green" : "gray"}>{supervisor?.running ? "auto-check on" : "manual checks"}</Badge>
        </div>
      </div>
    </Card>
  );
}

export function DemoSideRail({
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
  onOpenSandbox,
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
  onOpenSandbox: () => void;
}) {
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const realtimeEnabled = experience.capabilities.realtimeSupervisor;
  const showSandbox = experience.profile === "engineering" && experience.surfaces.kitchenSandbox;

  return (
    <div className="space-y-4">
      <Card>
        <SectionLabel>Run path</SectionLabel>
        <div className="space-y-2">
          <MiniStep done={readyCount === checkCount} active={readyCount < checkCount} label="1. Setup" detail="Connect the camera or glasses, open the device app if needed, and confirm the live view." />
          <MiniStep done={!!isActive || completed} active={readyCount === checkCount && !isActive} label="2. Start protocol" detail="Begin recording and show the first step." />
          {realtimeEnabled ? (
            <MiniStep done={!!supervisor?.running} active={isActive && !supervisor?.running} label="3. Auto-check" detail="While you work, each step can be checked from the live view." />
          ) : (
            <MiniStep done={completed} active={isActive && !completed} label="3. Confirm steps" detail="Each confirmation keeps evidence with the run and advances the protocol." />
          )}
          <MiniStep done={completed} active={isActive && !completed} label="4. Review" detail="Save the run, then open it to see what was recorded." />
        </div>
      </Card>

      <Card>
        <SectionLabel>Progress</SectionLabel>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{isActive ? `${progress} completed, ${Math.max(0, (run?.totalSteps || 0) - progress)} remaining` : `${readyCount} of ${checkCount} preflight checks ready`}</span>
          {realtimeEnabled && <span>{supervisor?.tickCount || 0} automatic checks</span>}
        </div>
        <ProgressBar value={isActive ? progress : readyCount} max={max} className="mt-2" />
        {supervisor?.lastResult && (
          <div className="mt-3 labos-inset p-2 text-[11px] text-muted">
            <span className="text-fg">Latest check</span>
            <div className="mt-1">{supervisor.lastResult.adherence.spokenSummary}</div>
          </div>
        )}
      </Card>

      {showSandbox && (
        <Card>
          <SectionLabel>Sandbox</SectionLabel>
          <p className="text-xs text-muted leading-relaxed">
            ER Tools and Video Import are available for debugging primitive checks, clip batches, and dataset experiments.
          </p>
          <Btn className="mt-3 w-full" size="sm" variant="secondary" onClick={onOpenSandbox}>
            Open Sandbox Tools
          </Btn>
        </Card>
      )}
    </div>
  );
}

export function MobileStickyAction({
  stageLabel,
  primaryAction,
  currentStep,
  recordingActive,
  className = "",
}: {
  stageLabel: string;
  primaryAction: OperatorAction;
  currentStep: KitchenStepStatus | null;
  recordingActive: boolean;
  className?: string;
}) {
  return (
    <div className={`fixed inset-x-3 bottom-20 z-30 lg:hidden ${className}`}>
      <div className="labos-panel bg-surface-2 p-3 text-fg shadow-xl border border-border/20">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">{stageLabel}</div>
            <div className="mt-1 truncate text-sm font-semibold text-fg">
              {currentStep ? currentStep.instruction : primaryAction.detail}
            </div>
          </div>
          {recordingActive && <Badge color="red">recording</Badge>}
        </div>
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
      </div>
    </div>
  );
}
