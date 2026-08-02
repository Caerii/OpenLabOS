import { useEffect, useMemo, useState } from "react";
import type {
  EntitySegmentationStatus,
  KitchenProtocolSummary,
  KitchenSavedManifestSummary,
  KitchenButtonConfirmStatus,
  KitchenOperatorReadiness,
  KitchenRealtimeSupervisorStatus,
  KitchenRunAdherenceResult,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
  LabosStatusResult,
  LiveCoachHealth,
  NativeRecordingState,
  PreviewHealth,
  RunPodCostGuardStatus,
} from "../../api";
import { Btn } from "../ui";
import LiveCoachPanel from "./LiveCoachPanel";
import { runNumberForId } from "../files/runLibraryModel";
import {
  buildAutoCoachCue,
  buildOperatorWorkflowState,
  buildPrimaryAction,
  buildReadinessChecks,
  defaultProtocolFor,
  EvidencePanel,
  FocusedRunModal,
  instructionHeadlineFor,
  LiveGlassesView,
  MobileEvidenceDetails,
  OperatorActionDock,
  OperatorRail,
  ProtocolInstructionPanel,
  ProtocolStatusRail,
  SetupHintBanner,
  SetupFixNext,
  KitchenInstrumentationDrawer,
  CaptureConsentModal,
  DependencyStatusPanel,
  JudgmentSourceBadge,
  hasCaptureConsent,
} from "./guided";

export default function GuidedDemoView({
  connected,
  protocols,
  selectedProtocol,
  onSelectProtocol,
  run,
  currentStep,
  isActive,
  preview,
  labos,
  recordingStatus,
  voiceHealth,
  segmentation,
  runpodGuard,
  supervisor,
  featureFlags,
  featureExperience,
  buttonMappings,
  buttonConfirmStatus,
  operatorReadiness,
  lastAdherence,
  error,
  busy,
  savingManifest,
  savedManifestRef,
  savedManifests,
  onLaunchLabos,
  onStartPreview,
  onSetButtonConfirm,
  onStartRun,
  onStartSupervisor,
  onStopSupervisor,
  onConfirmStep,
  onUndoStep,
  onAbortRun,
  onAdherenceTick,
  onSaveManifest,
  onOpenSandbox,
}: {
  connected: boolean;
  protocols: KitchenProtocolSummary[];
  selectedProtocol: string;
  onSelectProtocol: (id: string) => void;
  run: KitchenRunSummary | null;
  currentStep: KitchenStepStatus | null;
  isActive: boolean;
  preview: PreviewHealth | null;
  labos: LabosStatusResult | null;
  recordingStatus: { state: NativeRecordingState; health?: PreviewHealth } | null;
  voiceHealth: LiveCoachHealth | null;
  segmentation: EntitySegmentationStatus | null;
  runpodGuard: RunPodCostGuardStatus | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience: LabOSFeatureExperience | null;
  buttonMappings: Record<string, string> | null;
  buttonConfirmStatus: KitchenButtonConfirmStatus | null;
  operatorReadiness: KitchenOperatorReadiness | null;
  lastAdherence: KitchenRunAdherenceResult | null;
  error: string;
  busy: string;
  savingManifest: boolean;
  savedManifestRef: string;
  savedManifests: KitchenSavedManifestSummary[];
  onLaunchLabos: () => void;
  onStartPreview: () => void;
  onSetButtonConfirm: () => void;
  onStartRun: (protocolId: string) => void;
  onStartSupervisor: () => void;
  onStopSupervisor: () => void;
  onConfirmStep: () => void;
  onUndoStep: () => void;
  onAbortRun: () => void;
  onAdherenceTick: () => void;
  onSaveManifest: () => void;
  onOpenSandbox: () => void;
}) {
  const [dismissedFocusKey, setDismissedFocusKey] = useState("");
  const [readinessGraceExpired, setReadinessGraceExpired] = useState(false);
  const [runFrameBaseline, setRunFrameBaseline] = useState<{ runId: string; frameCount: number } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingProtocolId, setPendingProtocolId] = useState("");
  const defaultProtocol = defaultProtocolFor(protocols, selectedProtocol);
  const protocolId = defaultProtocol?.id || "";
  const readinessSummary = operatorReadiness?.summary;
  const glassesConnected = readinessSummary?.glassesConnected ?? connected;
  const previewReady = readinessSummary?.previewReady ?? (!!preview?.frameReachable || (!!preview?.streaming && (preview?.frameCount || 0) > 0));
  const recordingActive = readinessSummary?.recordingActive ?? (!!recordingStatus?.state.active || !!preview?.recording);
  const labosReady = readinessSummary?.labosReady ?? !!(labos?.isInstalled && labos?.isRunning);
  const sidecarReal = segmentation?.mode === "sidecar" && segmentation.health?.ok !== false;
  const voiceReady = !!voiceHealth?.configured;
  const shouldStartRun = glassesConnected && labosReady && previewReady && !!protocolId && !isActive;
  const realtimeEnabled = featureFlags?.realtimeSupervisorEnabled === true;
  const shouldStartSupervisor = realtimeEnabled && isActive && run?.status === "running" && !supervisor?.running;
  const coachEnabled = !!run && ["running", "paused", "completed"].includes(run.status);
  const decision = lastAdherence?.adherence || supervisor?.lastResult?.adherence || null;
  const runFocusKey = useMemo(() => {
    if (!run?.id) return "";
    if (run.status === "completed" || run.status === "aborted") return `${run.id}:${run.status}`;
    if (run.status === "running" || run.status === "paused") return `${run.id}:active`;
    return "";
  }, [run?.id, run?.status]);
  const focusModalOpen = !!runFocusKey && dismissedFocusKey !== runFocusKey;

  useEffect(() => {
    if (!run?.id && dismissedFocusKey) setDismissedFocusKey("");
  }, [dismissedFocusKey, run?.id]);

  useEffect(() => {
    if (!connected || operatorReadiness) {
      setReadinessGraceExpired(false);
      return;
    }
    const timeout = window.setTimeout(() => setReadinessGraceExpired(true), 4500);
    return () => window.clearTimeout(timeout);
  }, [connected, operatorReadiness]);

  const checks = buildReadinessChecks({
    connected: glassesConnected,
    labosReady,
    labos,
    previewReady,
    preview,
    recordingActive,
    recordingStatus,
    voiceReady,
    sidecarReal,
    voiceHealth,
    segmentation,
    runpodGuard,
    featureFlags,
    busy,
    buttonMappings,
    buttonConfirmStatus,
    operatorReadiness,
    onLaunchLabos,
    onStartPreview,
    onSetButtonConfirm,
  });

  const preflightChecking = connected && !operatorReadiness && !readinessGraceExpired;
  const visibleChecks = preflightChecking
    ? checks.map((check) => (
        check.state === "ready"
          ? check
          : {
              ...check,
              state: "checking" as const,
              detail: "Checking the glasses and required services...",
              action: undefined,
            }
      ))
    : checks;
  const readyCount = visibleChecks.filter((check) => check.state === "ready").length;
  const setupReady = readyCount === visibleChecks.length;
  const nextCheck = visibleChecks.find((check) => check.state === "blocked") || visibleChecks.find((check) => check.state === "warn") || null;
  const progress = isActive ? Math.max(run?.stepsCompleted || 0, 0) : 0;
  const max = isActive ? run?.totalSteps || 1 : visibleChecks.length;

  const requestGuidedRunStart = (protocolId: string) => {
    if (!protocolId) return;
    if (hasCaptureConsent()) {
      onStartRun(protocolId);
      return;
    }
    setPendingProtocolId(protocolId);
    setConsentOpen(true);
  };

  const primaryAction = buildPrimaryAction({
    completed: run?.status === "completed" || run?.status === "aborted",
    savedManifestRef,
    savingManifest,
    connected: glassesConnected,
    labosReady,
    previewReady,
    recordingActive,
    voiceReady,
    isActive,
    run,
    shouldStartRun,
    shouldStartSupervisor,
    busy,
    protocolId,
    supervisor,
    featureFlags,
    onSaveManifest,
    onLaunchLabos,
    onStartPreview,
    onStartRun: requestGuidedRunStart,
    onStartSupervisor,
    onConfirmStep,
  });
  const workflow = buildOperatorWorkflowState({
    run,
    isActive,
    supervisorRunning: !!supervisor?.running,
    nextCheck,
    featureFlags,
    primaryAction,
    busy,
    onStopSupervisor,
    onUndoStep,
    onAbortRun,
  });
  const autoCoachCue = buildAutoCoachCue({
    run,
    currentStepNumber: currentStep?.number,
    lastAdherence,
    supervisorRunning: !!supervisor?.running,
  });

  const evidenceProps = {
    result: lastAdherence,
    supervisor,
    savingManifest,
    savedManifestRef,
    onAdherenceTick,
    onSaveManifest,
  };
  const savedRunNumber = runNumberForId(savedManifests, run?.id) || (savedManifestRef && run?.id ? savedManifests.length + 1 : 0);
  const globalPreviewFrameCount = preview?.frameCount || 0;
  const runPreviewFrameCount = run?.id && runFrameBaseline?.runId === run.id
    ? Math.max(0, globalPreviewFrameCount - runFrameBaseline.frameCount)
    : 0;
  const instructionHeadline = currentStep
    ? currentStep.instruction
    : setupReady
      ? instructionHeadlineFor({
          currentStep,
          defaultProtocol,
          primaryAction: workflow.primaryAction,
          run,
        })
      : nextCheck?.id === "glasses" || !glassesConnected
        ? "Connect glasses to begin"
        : nextCheck?.label || "Complete setup to begin";
  const instructionDetail = currentStep
    ? workflow.primaryAction.detail
    : setupReady
      ? workflow.primaryAction.detail
      : nextCheck?.id === "glasses" || !glassesConnected
        ? "Use the connection bar at the top of the screen — enter the glasses IP and press Connect."
        : nextCheck?.detail || workflow.primaryAction.detail;
  const instructionKicker = currentStep
    ? `Step ${currentStep.number} of ${run?.totalSteps || "?"}`
    : workflow.stageLabel;

  useEffect(() => {
    if (!run?.id || (run.status !== "running" && run.status !== "paused")) {
      if (!run?.id) setRunFrameBaseline(null);
      return;
    }
    setRunFrameBaseline((baseline) => (
      baseline?.runId === run.id
        ? baseline
        : { runId: run.id, frameCount: globalPreviewFrameCount }
    ));
  }, [globalPreviewFrameCount, run?.id, run?.status]);

  const showActionDock = setupReady || isActive;
  const stepProgressPct =
    isActive && currentStep?.number && run?.totalSteps
      ? Math.min(100, (currentStep.number / run.totalSteps) * 100)
      : 0;

  return (
    <div className={`space-y-4 animate-fade-in sm:space-y-5 ${showActionDock ? "pb-[5.5rem] lg:pb-0" : "pb-4"}`}>
      <ProtocolStatusRail
        protocolName={defaultProtocol?.name || "Protocol"}
        stageLabel={workflow.stageLabel}
        connected={glassesConnected}
        previewReady={previewReady}
        voiceReady={voiceReady}
        segmentation={segmentation}
        supervisor={supervisor}
        featureFlags={featureFlags}
        featureExperience={featureExperience}
        stepNumber={currentStep?.number}
        stepTotal={run?.totalSteps}
        setupReady={setupReady}
      />

      <SetupHintBanner checks={visibleChecks} readyCount={readyCount} connected={glassesConnected} />

      <SetupFixNext checks={visibleChecks} readyCount={readyCount} setupReady={setupReady} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <DependencyStatusPanel />
        <div className="rounded-lg border border-border/15 bg-surface-2 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Check source</div>
          <div className="mt-2">
            <JudgmentSourceBadge
              lastAdherence={lastAdherence}
              supervisor={supervisor}
              segmentation={segmentation}
              runpodGuard={runpodGuard}
            />
          </div>
        </div>
      </div>

      <KitchenInstrumentationDrawer
        featureFlags={featureFlags}
        featureExperience={featureExperience}
        preview={preview}
        operatorReadiness={operatorReadiness}
        buttonConfirmStatus={buttonConfirmStatus}
        voiceHealth={voiceHealth}
        segmentation={segmentation}
        runpodGuard={runpodGuard}
        supervisor={supervisor}
        lastAdherence={lastAdherence}
      />

      <div className="oc-workspace">
        <main className="oc-stage">
          <div className="oc-viewport-shell">
            <LiveGlassesView
              variant="console"
              connected={glassesConnected}
              previewReady={previewReady}
              frameCount={globalPreviewFrameCount}
              fps={Number(preview?.fps || 0)}
            />
            {isActive && run?.totalSteps ? (
              <div className="oc-viewport-progress" aria-hidden>
                <span style={{ width: `${stepProgressPct}%` }} />
              </div>
            ) : null}
            <ProtocolInstructionPanel
              stageLabel={workflow.stageLabel}
              kicker={instructionKicker}
              headline={instructionHeadline}
              detail={instructionDetail}
              stepNumber={currentStep?.number}
              stepTotal={run?.totalSteps}
            />
          </div>

          {workflow.advancedEvidenceEnabled && (
            <div className="oc-evidence-collapse mt-4 space-y-4">
              <MobileEvidenceDetails {...evidenceProps} />
              <div className="hidden lg:block">
                <EvidencePanel {...evidenceProps} />
              </div>
            </div>
          )}

          {workflow.capabilities.handsFree && (
            <LiveCoachPanel
              enabled={coachEnabled}
              protocolId={protocolId || "kitchen-tea-v1"}
              currentStepNumber={currentStep?.number}
              autoCue={autoCoachCue}
              showTransportControls={false}
            />
          )}
        </main>

        <OperatorRail
          checks={visibleChecks}
          readyCount={readyCount}
          setupReady={setupReady}
          protocolId={protocolId}
          protocols={protocols}
          isActive={isActive}
          run={run}
          currentStep={currentStep}
          primaryAction={workflow.primaryAction}
          shouldStartRun={shouldStartRun}
          shouldStartSupervisor={shouldStartSupervisor}
          busy={busy}
          featureFlags={featureFlags}
          featureExperience={featureExperience}
          progress={progress}
          max={max}
          supervisor={supervisor}
          completed={workflow.terminalReview}
          secondaryActions={workflow.secondaryActions}
          onSelectProtocol={onSelectProtocol}
          onStartRun={requestGuidedRunStart}
          onStartSupervisor={onStartSupervisor}
          onConfirmStep={onConfirmStep}
        />
      </div>

      {showActionDock ? (
        <OperatorActionDock
          stageLabel={workflow.stageLabel}
          primaryAction={workflow.primaryAction}
          secondaryActions={workflow.secondaryActions}
          currentStep={currentStep}
          recordingActive={recordingActive}
          showSecondary={isActive}
        />
      ) : null}

      {!!runFocusKey && !focusModalOpen && (
        <Btn
          className="fixed bottom-20 right-4 z-30 shadow-lg lg:bottom-6"
          variant="primary"
          size="sm"
          onClick={() => setDismissedFocusKey("")}
        >
          Open Run View
        </Btn>
      )}

      <CaptureConsentModal
        open={consentOpen}
        onClose={() => {
          setConsentOpen(false);
          setPendingProtocolId("");
        }}
        onConfirm={() => {
          setConsentOpen(false);
          const protocolToStart = pendingProtocolId || protocolId;
          setPendingProtocolId("");
          if (protocolToStart) onStartRun(protocolToStart);
        }}
      />

      <FocusedRunModal
        open={focusModalOpen}
        onClose={() => setDismissedFocusKey(runFocusKey)}
        defaultProtocol={defaultProtocol}
        run={run}
        currentStep={currentStep}
        primaryAction={workflow.primaryAction}
        secondaryActions={workflow.secondaryActions}
        decision={decision}
        recordingActive={recordingActive}
        buttonConfirmReady={workflow.capabilities.buttonConfirm && buttonConfirmStatus?.ready === true}
        connected={glassesConnected}
        previewReady={previewReady}
        frameCount={runPreviewFrameCount}
        fps={Number(preview?.fps || 0)}
        savedManifestRef={savedManifestRef}
        savedRunNumber={savedRunNumber}
        error={error}
      />
    </div>
  );
}
