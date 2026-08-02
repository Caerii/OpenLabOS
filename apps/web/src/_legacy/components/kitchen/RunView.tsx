import { useState } from "react";
import { Btn, Card, ConfirmDialog, EmptyState, Icon } from "../ui/index";
import { ICON } from "./icons";
import type {
  EntitySegmentationStatus,
  KitchenRealtimeSupervisorStatus,
  KitchenRunAdherenceResult,
  KitchenRunSummary,
  KitchenStepStatus,
  LabOSFeatureFlags,
} from "../../api";
import { deriveLabOSExperience } from "../../lib/labosExperience";
import LiveCoachPanel from "./LiveCoachPanel";
import {
  PerceptionStackCard,
  RunComplete,
  RunHeader,
  StepCard,
  SupervisorCard,
} from "./run";

type RunViewProps = {
  run: KitchenRunSummary | null;
  runData: { protocol: { name: string } | null } | null;
  currentStep: KitchenStepStatus | null;
  isActive: boolean;
  verifying: boolean;
  confirmingStep: boolean;
  adherenceChecking: boolean;
  autoAdherence: boolean;
  lastAdherence: KitchenRunAdherenceResult | null;
  segmentationStatus: EntitySegmentationStatus | null;
  supervisorStatus: KitchenRealtimeSupervisorStatus | null;
  featureFlags: LabOSFeatureFlags | null;
  supervisorChanging: boolean;
  onStartSupervisor: () => void;
  onStopSupervisor: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  onConfirmStep: () => void;
  onUndoStep: () => void;
  onVerify: () => void;
  onAdherenceTick: () => void;
  onAutoAdherenceChange: (value: boolean) => void;
  onSkip: () => void;
  onComplete: () => void | Promise<void>;
  onBrowse: () => void;
};

export default function RunView({
  run,
  runData,
  currentStep,
  isActive,
  verifying,
  confirmingStep,
  adherenceChecking,
  autoAdherence,
  lastAdherence,
  segmentationStatus,
  supervisorStatus,
  featureFlags,
  supervisorChanging,
  onStartSupervisor,
  onStopSupervisor,
  onPause,
  onResume,
  onAbort,
  onConfirmStep,
  onUndoStep,
  onVerify,
  onAdherenceTick,
  onAutoAdherenceChange,
  onSkip,
  onComplete,
  onBrowse,
}: RunViewProps) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const experience = deriveLabOSExperience(featureFlags);

  if (!isActive) {
    return (
      <Card className="text-center py-16 animate-fade-in">
        <EmptyState
          icon={<Icon d={ICON.play} size={32} />}
          title="No active run"
          description="Select a protocol and start a run to begin."
          action={<Btn variant="primary" onClick={onBrowse}>Browse Protocols</Btn>}
        />
      </Card>
    );
  }

  const liveCoachEnabled = run?.status === "running" || run?.status === "paused";
  const showExpertPanels = experience.mode === "engineering";

  return (
    <div className="space-y-4 animate-fade-in">
      <RunHeader
        run={run}
        protocolName={runData?.protocol?.name}
        currentStep={currentStep}
        onPause={onPause}
        onResume={onResume}
        onAbort={onAbort}
      />

      {liveCoachEnabled && (
        <p className="text-[11px] text-muted -mt-2 mb-1">
          Preview starts when the run starts. While the stream is connected, verify uses the same live frames (no extra snapshot round-trip).
        </p>
      )}

      {experience.surfaces.liveCoach && (
        <LiveCoachPanel enabled={!!isActive && liveCoachEnabled} />
      )}
      {showExpertPanels && (
        <>
          <PerceptionStackCard segmentationStatus={segmentationStatus} supervisorStatus={supervisorStatus} />
          {experience.capabilities.realtimeSupervisor && (
            <SupervisorCard
              status={supervisorStatus}
              changing={supervisorChanging}
              onStart={onStartSupervisor}
              onStop={onStopSupervisor}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Force advance without passing verify?"
        description="Verify Step only advances the protocol when ER reports success with enough confidence. Use override for recovery or when the model is clearly wrong, not for skipping real checks during evaluation."
        destructive
        confirmText="Force advance"
        onConfirm={() => {
          setOverrideOpen(false);
          void Promise.resolve(onComplete());
        }}
      />

      {currentStep && (
        <StepCard
          step={currentStep}
          verifying={verifying}
          confirmingStep={confirmingStep}
          adherenceChecking={adherenceChecking}
          autoAdherence={autoAdherence}
          lastAdherence={lastAdherence}
          featureFlags={featureFlags}
          onConfirmStep={onConfirmStep}
          onUndoStep={onUndoStep}
          canUndoStep={(run?.stepsCompleted || 0) > 0}
          onVerify={onVerify}
          onAdherenceTick={onAdherenceTick}
          onAutoAdherenceChange={onAutoAdherenceChange}
          onSkip={onSkip}
          onRequestCompleteOverride={() => setOverrideOpen(true)}
        />
      )}

      {run?.status === "completed" && (
        <RunComplete totalSteps={run.totalSteps} onNewRun={onAbort} />
      )}
    </div>
  );
}
