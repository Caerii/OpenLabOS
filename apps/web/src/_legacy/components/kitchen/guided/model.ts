import type {
  EntitySegmentationStatus,
  KitchenRunAdherenceResult,
  KitchenRunSummary,
  KitchenProtocolSummary,
  KitchenButtonConfirmStatus,
  KitchenOperatorReadiness,
  KitchenOperatorReadinessCheck,
  KitchenRealtimeSupervisorStatus,
  LabosStatusResult,
  LabOSFeatureFlags,
  LiveCoachHealth,
  NativeRecordingState,
  PreviewHealth,
  RunPodCostGuardStatus,
} from "../../../api";
import {
  deriveFeatureCapabilities,
  featureFlagsOrDefault,
  type LabOSFeatureCapabilities,
} from "../../../lib/labosExperience";
import type { CheckItem, CoachAutoCue, OperatorAction, OperatorSecondaryAction } from "./types";
import { runpodLabel, voiceLabel } from "./statusLabels";

export { deriveFeatureCapabilities, featureFlagsOrDefault };
export type { LabOSFeatureCapabilities };

export interface OperatorWorkflowState {
  terminalReview: boolean;
  stageLabel: string;
  primaryAction: OperatorAction;
  secondaryActions: OperatorSecondaryAction[];
  canUndoStep: boolean;
  capabilities: LabOSFeatureCapabilities;
  advancedEvidenceEnabled: boolean;
}

export function defaultProtocolFor(protocols: KitchenProtocolSummary[], selectedProtocol: string) {
  return (
    protocols.find((protocol) => protocol.id === selectedProtocol) ||
    protocols.find((protocol) => protocol.id === "kitchen-tea-v1") ||
    protocols[0] ||
    null
  );
}

export function stageLabelFor({
  completed,
  supervising,
  isActive,
  nextCheck,
}: {
  completed: boolean;
  supervising: boolean;
  isActive: boolean;
  nextCheck: CheckItem | null;
}) {
  if (completed) return "Review";
  if (supervising) return "Hands-free";
  if (isActive) return "Run active";
  if (nextCheck) return "Setup";
  return "Ready";
}

export function buildReadinessChecks({
  connected,
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
}: {
  connected: boolean;
  labosReady: boolean;
  labos: LabosStatusResult | null;
  previewReady: boolean;
  preview: PreviewHealth | null;
  recordingActive: boolean;
  recordingStatus: { state: NativeRecordingState; health?: PreviewHealth } | null;
  voiceReady: boolean;
  sidecarReal: boolean;
  voiceHealth: LiveCoachHealth | null;
  segmentation: EntitySegmentationStatus | null;
  runpodGuard: RunPodCostGuardStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  busy: string;
  onLaunchLabos: () => void;
  onStartPreview: () => void;
  buttonMappings?: Record<string, string> | null;
  buttonConfirmStatus?: KitchenButtonConfirmStatus | null;
  operatorReadiness?: KitchenOperatorReadiness | null;
  onSetButtonConfirm?: () => void;
}): CheckItem[] {
  if (operatorReadiness?.checks.length) {
    return operatorReadiness.checks.map((check) => readinessCheckToItem(check, {
      connected,
      busy,
      onLaunchLabos,
      onStartPreview,
      onSetButtonConfirm,
    }));
  }

  const capabilities = deriveFeatureCapabilities(featureFlags);
  const checks: CheckItem[] = [
    {
      id: "glasses",
      label: "Glasses connected",
      detail: connected ? "The glasses are connected. Keep them awake and pointed at the workspace." : "Connect the glasses before starting the guided run.",
      state: connected ? "ready" : "blocked",
    },
    {
      id: "labos",
      label: "LabOS app running",
      detail: labosReady
        ? "The on-device LabOS app is installed and running."
        : labos?.isInstalled
          ? "The app is installed but not currently running."
          : "The LabOS app is not installed or status is unavailable.",
      state: labosReady ? "ready" : connected ? "blocked" : "warn",
      action: !labosReady && connected ? { label: "Launch App", onClick: onLaunchLabos, loading: busy === "labos" } : undefined,
    },
    {
      id: "preview",
      label: "Live preview frames",
      detail: previewReady
        ? `The camera view is live at ${Number(preview?.fps || 0).toFixed(1)} fps.`
        : "Start the camera preview so step checks can see the workspace.",
      state: previewReady ? "ready" : connected ? "blocked" : "warn",
      action: !previewReady && connected ? { label: "Start Preview", onClick: onStartPreview, loading: busy === "preview" } : undefined,
    },
    {
      id: "recording",
      label: "Session recording",
      detail: recordingActive
        ? `Recording is active${recordingStatus?.state.activeVideoPath ? " on the glasses" : ""}. The capture light on the right should be visible.`
        : "Recording starts automatically when you start the run.",
      state: "ready",
    },
  ];
  if (capabilities.buttonConfirm) {
    const cameraShort = buttonConfirmStatus?.mappings?.camera_short || buttonMappings?.camera_short;
    const mapped = buttonConfirmStatus?.mapped ?? cameraShort === "protocol_confirm_step";
    const streamConnected = buttonConfirmStatus?.sensorBridgeConnected;
    const ready = buttonConfirmStatus?.ready ?? mapped;
    const loading = busy === "button-confirm";
    const actionLabel = mapped && streamConnected === false ? "Reconnect Button" : "Set Button";
    const detail = ready
      ? "Short-press the camera button after each step. The run will save evidence and advance."
      : mapped && streamConnected === false
        ? "Camera short-press is mapped, but LabOS could not connect to the button event stream automatically."
        : cameraShort
          ? "Map camera short-press to Confirm Step so the operator does not need the laptop during the run."
          : "Checking button mapping. Use Set Button if this does not become ready.";
    checks.push({
      id: "button-confirm",
      label: "Glasses button confirms steps",
      detail,
      state: ready ? "ready" : connected ? "blocked" : "warn",
      action: !ready && connected && onSetButtonConfirm
        ? { label: actionLabel, onClick: onSetButtonConfirm, loading }
        : undefined,
    });
  }
  if (capabilities.handsFree || capabilities.realtimeSupervisor || capabilities.postStepValidation) {
    const objectDetectionLabel = segmentation?.mode === "sidecar"
      ? segmentation.health?.ok === false ? "unavailable" : "ready"
      : "sample mode";
    checks.push({
      id: "voice",
      label: "Voice and object detection",
      detail: `Voice: ${voiceLabel(voiceHealth)}. Object detection: ${objectDetectionLabel}. Remote checks: ${runpodLabel(runpodGuard)}.`,
      state: voiceReady && sidecarReal ? "ready" : "warn",
    });
  }
  return checks;
}

function readinessCheckToItem(
  check: KitchenOperatorReadinessCheck,
  opts: {
    connected: boolean;
    busy: string;
    onLaunchLabos: () => void;
    onStartPreview: () => void;
    onSetButtonConfirm?: () => void;
  },
): CheckItem {
  const base = {
    id: check.id,
    label: check.label,
    detail: check.detail,
    state: check.state,
  };
  if (!opts.connected && check.recoveryAction !== "connect_glasses") return base;
  switch (check.recoveryAction) {
    case "launch_labos":
      return { ...base, action: { label: "Launch App", onClick: opts.onLaunchLabos, loading: opts.busy === "labos" } };
    case "start_preview":
      return { ...base, action: { label: "Start Preview", onClick: opts.onStartPreview, loading: opts.busy === "preview" } };
    case "set_button_confirm":
      return opts.onSetButtonConfirm
        ? { ...base, action: { label: "Set Button", onClick: opts.onSetButtonConfirm, loading: opts.busy === "button-confirm" } }
        : base;
    case "reconnect_button":
      return opts.onSetButtonConfirm
        ? { ...base, action: { label: "Reconnect Button", onClick: opts.onSetButtonConfirm, loading: opts.busy === "button-confirm" } }
        : base;
    default:
      return base;
  }
}

export function buildPrimaryAction({
  completed,
  savedManifestRef,
  savingManifest,
  connected,
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
  onStartRun,
  onStartSupervisor,
  onConfirmStep,
}: {
  completed: boolean;
  savedManifestRef: string;
  savingManifest: boolean;
  connected: boolean;
  labosReady: boolean;
  previewReady: boolean;
  recordingActive: boolean;
  voiceReady: boolean;
  isActive: boolean;
  run: KitchenRunSummary | null;
  shouldStartRun: boolean;
  shouldStartSupervisor: boolean;
  busy: string;
  protocolId: string;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  onSaveManifest: () => void;
  onLaunchLabos: () => void;
  onStartPreview: () => void;
  onStartRun: (protocolId: string) => void;
  onStartSupervisor: () => void;
  onConfirmStep: () => void;
}): OperatorAction {
  const flags = featureFlagsOrDefault(featureFlags);
  const capabilities = deriveFeatureCapabilities(flags);
  if (completed) {
    const partial = run?.status === "aborted";
    if (savedManifestRef) {
      const savedDetail = capabilities.advancedEvidence
        ? `${partial ? "The partial run" : "The run"} is saved to dashboard/data/${savedManifestRef}.`
        : `${partial ? "The partial run" : "The run"} is saved and ready for review.`;
      if (!connected) return { label: "Connect Glasses First", detail: `${savedDetail} Reconnect the glasses to run the protocol again.`, disabled: true };
      if (!labosReady) return { label: "Launch LabOS App", detail: `${savedDetail} Start the on-device service before the next run.`, loading: busy === "labos", onClick: onLaunchLabos };
      if (!previewReady) return { label: "Start Camera Preview", detail: `${savedDetail} Start frames before the next run.`, loading: busy === "preview", onClick: onStartPreview };
      return {
        label: "Start Another Run",
        detail: `${savedDetail} Start a fresh recording from step 1.`,
        disabled: !shouldStartRun,
        loading: busy === "run" || busy === "supervisor",
        onClick: () => protocolId && onStartRun(protocolId),
      };
    }
    return {
      label: "Save Run",
      detail: partial
        ? "Save this partial run before starting over."
        : "Save this run for replay and review.",
      loading: savingManifest,
      onClick: onSaveManifest,
    };
  }
  if (!connected) return { label: "Connect Glasses First", detail: "Use the top connection bar, then return here.", disabled: true };
  if (!labosReady) return { label: "Launch LabOS App", detail: "Starts the on-device service before preview and recording.", loading: busy === "labos", onClick: onLaunchLabos };
  if (!previewReady) return { label: "Start Camera Preview", detail: "Opens the glasses view so step checks can see the workspace.", loading: busy === "preview", onClick: onStartPreview };
  if (!isActive) {
    return {
      label: capabilities.handsFree && voiceReady ? "Start Hands-Free Run" : "Start Protocol Run",
      detail: capabilities.handsFree && voiceReady
        ? "Starts recording, opens the first step, and enables automatic checks."
        : capabilities.buttonConfirm
          ? "Starts native recording. The operator short-presses the glasses button after each step."
          : "Starts native recording and opens the first step.",
      disabled: !shouldStartRun,
      loading: busy === "run" || busy === "supervisor",
      onClick: () => protocolId && onStartRun(protocolId),
    };
  }
  if (run?.status === "running" && capabilities.stepSegments && (!capabilities.realtimeSupervisor || flags.protocolMode === "manual")) {
    if (!recordingActive) {
      return {
        label: "Recording Not Ready",
        detail: "Wait for native recording to restart before confirming. If it does not recover, stop this run and start another attempt.",
        disabled: true,
      };
    }
    return {
      label: capabilities.buttonConfirm ? "Confirm Step (or short-press)" : "Confirm Step",
      detail: capabilities.postStepValidation
        ? "Capture this step and run validation."
        : capabilities.buttonConfirm
          ? "Short-press the glasses button or use this fallback button to save evidence and advance."
          : "Capture this step and move to the next one.",
      loading: busy === "confirm-step",
      onClick: onConfirmStep,
    };
  }
  if (capabilities.realtimeSupervisor && shouldStartSupervisor) {
    return {
      label: "Start Auto-Check",
      detail: "The run is ready. Start automatic step checks.",
      loading: busy === "supervisor",
      onClick: onStartSupervisor,
    };
  }
  return {
    label: supervisor?.running ? "Auto-Check Running" : "Run Active",
    detail: supervisor?.running ? "Continue the task. Each step will be checked from the live camera view." : "Use Check Now or start Auto-Check.",
    disabled: true,
  };
}

export function buildOperatorWorkflowState({
  run,
  isActive,
  supervisorRunning,
  nextCheck,
  featureFlags,
  primaryAction,
  busy,
  onStopSupervisor,
  onUndoStep,
  onAbortRun,
}: {
  run: KitchenRunSummary | null;
  isActive: boolean;
  supervisorRunning: boolean;
  nextCheck: CheckItem | null;
  featureFlags: LabOSFeatureFlags | null;
  primaryAction: OperatorAction;
  busy: string;
  onStopSupervisor: () => void;
  onUndoStep: () => void;
  onAbortRun: () => void;
}): OperatorWorkflowState {
  const terminalReview = run?.status === "completed" || run?.status === "aborted";
  const capabilities = deriveFeatureCapabilities(featureFlags);
  const canUndoStep = isActive && run?.status === "running" && (run?.stepsCompleted || 0) > 0;
  const secondaryActions: OperatorSecondaryAction[] = [];
  if (supervisorRunning) {
    secondaryActions.push({
      key: "stop-realtime",
      label: "Stop Auto-Check",
      detail: "Stop automatic checks and continue with manual step confirmation.",
      variant: "secondary",
      loading: busy === "supervisor",
      onClick: onStopSupervisor,
    });
  }
  if (isActive) {
    secondaryActions.push({
      key: "redo-previous-step",
      label: "Redo Previous Step",
      detail: "Move back one completed step and mark the earlier attempt as replaced.",
      variant: "secondary",
      disabled: !canUndoStep,
      onClick: onUndoStep,
    });
    secondaryActions.push({
      key: "stop-run",
      label: "Stop Run",
      detail: "Stop recording and save this partial run for review.",
      variant: "ghost",
      loading: busy === "stop-run",
      onClick: onAbortRun,
    });
  }
  return {
    terminalReview,
    stageLabel: stageLabelFor({
      completed: terminalReview,
      supervising: supervisorRunning,
      isActive,
      nextCheck,
    }),
    primaryAction,
    secondaryActions,
    canUndoStep,
    capabilities,
    advancedEvidenceEnabled: capabilities.advancedEvidence,
  };
}

export function buildAutoCoachCue({
  run,
  currentStepNumber,
  lastAdherence,
  supervisorRunning,
}: {
  run: KitchenRunSummary | null;
  currentStepNumber?: number | null;
  lastAdherence: KitchenRunAdherenceResult | null;
  supervisorRunning: boolean;
}): CoachAutoCue | null {
  if (!run || run.status === "idle" || run.status === "setup" || run.status === "aborted") return null;
  if (run.status === "completed") {
    return { key: `complete:${run.id}`, trigger: "run_completed" };
  }
  if (run.status !== "running" || !supervisorRunning) return null;

  const action = lastAdherence?.adherence.action;
  if (lastAdherence?.stepAdvanced) {
    const passedStep = Math.max(1, run.stepsCompleted || currentStepNumber || 1);
    return { key: `passed:${run.id}:${passedStep}:${run.stepsCompleted}`, trigger: "step_passed", stepNumber: passedStep };
  }
  if ((action === "possible_deviation" || action === "blocked") && currentStepNumber) {
    const memory = lastAdherence?.adherence.stateMemory;
    return {
      key: `deviation:${run.id}:${currentStepNumber}:${memory?.updatedAt || lastAdherence?.adherence.confidence || 0}`,
      trigger: "possible_deviation",
      stepNumber: currentStepNumber,
    };
  }
  if (
    (action === "collect_more_evidence" || action === "confirming") &&
    currentStepNumber &&
    (lastAdherence?.adherence.stateMemory.consecutiveUncertain || 0) >= 2
  ) {
    return {
      key: `uncertain:${run.id}:${currentStepNumber}:${lastAdherence?.adherence.stateMemory.updatedAt || 0}`,
      trigger: "low_confidence_or_occluded",
      stepNumber: currentStepNumber,
    };
  }
  if (run.stepsCompleted === 0 && currentStepNumber === 1) {
    return { key: `welcome:${run.id}`, trigger: "run_started" };
  }
  if (currentStepNumber) {
    return { key: `step:${run.id}:${currentStepNumber}`, trigger: "step_started", stepNumber: currentStepNumber };
  }
  return null;
}
