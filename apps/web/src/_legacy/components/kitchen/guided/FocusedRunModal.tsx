import { Badge, Btn, Modal, ProgressBar, SectionLabel } from "../../ui/index";
import type {
  KitchenProtocolSummary,
  KitchenRunSummary,
  KitchenStepStatus,
} from "../../../api";
import type { AdherenceDecision, OperatorAction, OperatorSecondaryAction } from "./types";
import { terminalRunOperatorMessage, terminalRunStatusLabel } from "./completionCopy";
import { runNaturalLabel, runReviewHref } from "../../files/runLibraryModel";
import { ResilientPreviewStream } from "../../preview/ResilientPreviewStream";
import { formatPreviewLatency, usePreviewFrameLatency } from "../../preview/usePreviewFrameLatency";
import { StepVoiceCue } from "./StepVoiceCue";

function decisionLabel(decision: AdherenceDecision | null) {
  if (!decision) return "";
  return decision.action.replace(/_/g, " ");
}

function runBadgeColor(status?: string): "green" | "yellow" | "blue" | "gray" {
  if (status === "completed") return "green";
  if (status === "aborted" || status === "paused") return "yellow";
  if (status === "running") return "blue";
  return "gray";
}

function secondaryLabel(action: OperatorSecondaryAction) {
  if (action.key === "redo-previous-step") return "Redo Step";
  if (action.key === "stop-run") return "Stop Run";
  return action.label;
}

function FocusedGlassesStream({
  connected,
  previewReady,
  frameCount,
  fps,
}: {
  connected: boolean;
  previewReady: boolean;
  frameCount: number;
  fps: number;
}) {
  const latencyMs = usePreviewFrameLatency(connected && previewReady);

  return (
    <div className="overflow-hidden rounded-xl border border-border/15 bg-black">
      <div className="flex flex-col gap-2 border-b border-overlay/10 bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Live glasses view</div>
          <div className="hidden text-xs text-muted sm:block">Keep the workspace centered in this view.</div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
          <Badge color={previewReady ? "green" : "yellow"}>{previewReady ? "streaming" : "waiting"}</Badge>
          <Badge color="gray">{frameCount} run frames</Badge>
          <Badge color="gray">{fps.toFixed(1)} fps</Badge>
          <Badge color={latencyMs !== null ? "blue" : "gray"}>{formatPreviewLatency(latencyMs)}</Badge>
        </div>
      </div>
      <ResilientPreviewStream
        connected={connected}
        streaming={previewReady}
        frameCount={frameCount}
        latencyMs={latencyMs}
        showStreamMetrics
        disconnectedMessage="Connect glasses to view the camera stream."
      />
    </div>
  );
}

export function FocusedRunModal({
  open,
  onClose,
  defaultProtocol,
  run,
  currentStep,
  primaryAction,
  secondaryActions,
  decision,
  recordingActive,
  buttonConfirmReady,
  connected,
  previewReady,
  frameCount,
  fps,
  savedManifestRef,
  savedRunNumber,
  error,
}: {
  open: boolean;
  onClose: () => void;
  defaultProtocol: KitchenProtocolSummary | null;
  run: KitchenRunSummary | null;
  currentStep: KitchenStepStatus | null;
  primaryAction: OperatorAction;
  secondaryActions: OperatorSecondaryAction[];
  decision: AdherenceDecision | null;
  recordingActive: boolean;
  buttonConfirmReady: boolean;
  connected: boolean;
  previewReady: boolean;
  frameCount: number;
  fps: number;
  savedManifestRef?: string;
  savedRunNumber?: number;
  error?: string;
}) {
  const stepNumber = currentStep?.number || run?.currentStep || 0;
  const totalSteps = run?.totalSteps || 1;
  const completedSteps = run?.stepsCompleted || 0;
  const terminal = run?.status === "completed" || run?.status === "aborted";
  const running = run?.status === "running";
  const title = terminal ? "Review Run" : "Protocol Run";
  const stepLabel = currentStep ? `Step ${stepNumber} of ${totalSteps}` : "Preparing first step";
  const progressLabel = terminal ? terminalRunStatusLabel(run) : currentStep ? `Current: ${stepLabel}` : stepLabel;
  const instruction = terminal
    ? terminalRunOperatorMessage(run, savedManifestRef)
    : currentStep?.instruction || (running ? "Waiting for the next step instruction." : primaryAction.detail);
  const showButtonCue = running && buttonConfirmReady;
  const reviewHref = terminal && savedManifestRef && run?.id ? runReviewHref(run.id) : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      overlayClassName="items-end justify-center p-2 sm:items-center sm:p-6"
      className="w-full max-w-xl lg:max-w-5xl"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border border-border/20 bg-surface-2 shadow-2xl sm:max-h-[min(46rem,calc(100dvh-3rem))]">
        <div className="border-b border-border/15 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionLabel>{title}</SectionLabel>
              <h3 className="mt-1 truncate text-xl font-semibold text-fg">
                {defaultProtocol?.name || run?.protocolName || "Kitchen protocol"}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {terminal ? primaryAction.detail : "Stay on this screen during the run. The glasses button can confirm each step."}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge color={runBadgeColor(run?.status)}>{run?.status || "ready"}</Badge>
              {recordingActive && <Badge color="red">recording</Badge>}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>{completedSteps} completed</span>
              <span>{progressLabel}</span>
            </div>
            <ProgressBar value={completedSteps} max={totalSteps} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)] lg:items-start">
            <div className="rounded-xl border border-highlight-border/25 bg-highlight-bg/10 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accentText">
                  {terminal ? terminalRunStatusLabel(run) : "Current instruction"}
                </div>
                {decision && <Badge color={decision.action === "advance" ? "green" : "yellow"}>{decisionLabel(decision)}</Badge>}
              </div>
              {!terminal && (
                <div className="mt-1 text-sm font-semibold text-fg">{stepLabel}</div>
              )}
              <p className="mt-2 text-lg font-semibold leading-snug text-fg sm:text-2xl">
                {instruction}
              </p>
              {!terminal && (
                <StepVoiceCue
                  protocolId={run?.protocolId || defaultProtocol?.id}
                  currentStep={currentStep}
                />
              )}
              {!terminal && currentStep?.requiredObjects?.length ? (
                <div className="mt-3 sm:mt-4">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Items to use</div>
                  <div className="flex flex-wrap gap-1.5">
                  {currentStep.requiredObjects.map((object) => <Badge key={object} color="blue">{object}</Badge>)}
                  </div>
                </div>
              ) : null}
              {showButtonCue && (
                <div className="mt-3 rounded-lg border border-highlight-border/20 bg-highlight-bg/10 p-2.5 text-sm text-accentText sm:mt-4 sm:p-3">
                  Short-press the glasses camera button after completing this step.
                </div>
              )}
              {reviewHref && (
                <a
                  className="mt-4 block rounded-lg border border-highlight-border/30 bg-surface-2 px-3 py-2 text-sm font-semibold text-accentText hover:text-highlight"
                  href={reviewHref}
                >
                  Review {runNaturalLabel(savedRunNumber)}
                </a>
              )}
            </div>
            <FocusedGlassesStream
              connected={connected}
              previewReady={previewReady}
              frameCount={frameCount}
              fps={fps}
            />
          </div>

          {decision?.spokenSummary && (
            <div className="mt-3 labos-inset p-3 text-sm text-muted">
              {decision.spokenSummary}
            </div>
          )}
        </div>

        <div className="border-t border-border/15 bg-surface-2/95 p-4 sm:p-5">
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
          <Btn
            className="w-full py-3 text-base"
            variant="primary"
            size="md"
            disabled={primaryAction.disabled || !primaryAction.onClick}
            loading={primaryAction.loading}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Btn>
          <div className="mt-2 grid grid-cols-2 gap-2">
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
                {secondaryLabel(action)}
              </Btn>
            ))}
            <Btn className="w-full" variant="ghost" size="sm" onClick={onClose}>
              Minimize
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
