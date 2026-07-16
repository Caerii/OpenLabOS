import {
  kitchenOperatorConfirmStep,
  kitchenRunAdherenceTick,
  kitchenVerifyStep,
  type ERAnalysisResult,
  type KitchenRunAdherenceResult,
  type LabOSFeatureFlags,
  type LabOSWorkflowPreset,
} from "../../../api";
import { withControllerError } from "./errorBoundary";
import type { KitchenDemoRefresh, StateSetter } from "./types";
import { DEFAULT_LABOS_FEATURE_FLAGS } from "../../../lib/labosExperience";

function operatorConfirmStepRequest(flags: LabOSFeatureFlags, preset: LabOSWorkflowPreset) {
  return {
    requireNativeRecording: true,
    captureFrame: true,
    captureChunk: false,
    stopRecordingForSegment: true,
    validate: flags.confirmStepValidationEnabled,
    maxChecks: preset.supervisor.maxChecks,
  };
}

export function useVerificationActions({
  refresh,
  preset,
  featureFlags,
  setError,
  setVerifying,
  setConfirmingStep,
  setAdherenceChecking,
  setLastResult,
  setLastAdherence,
}: {
  refresh: KitchenDemoRefresh;
  preset: LabOSWorkflowPreset;
  featureFlags: LabOSFeatureFlags | null;
  setError: StateSetter<string>;
  setVerifying: StateSetter<boolean>;
  setConfirmingStep: StateSetter<boolean>;
  setAdherenceChecking: StateSetter<boolean>;
  setLastResult: StateSetter<ERAnalysisResult | null>;
  setLastAdherence: StateSetter<KitchenRunAdherenceResult | null>;
}) {
  const flags = featureFlags || DEFAULT_LABOS_FEATURE_FLAGS;

  const confirmStep = async () => {
    setConfirmingStep(true);
    try {
      await withControllerError(setError, async () => {
        const result = await kitchenOperatorConfirmStep(operatorConfirmStepRequest(flags, preset));
        const confirm = result.result.confirm;
        if (confirm.validation) {
          setLastAdherence(confirm.validation);
          setLastResult({
            mode: "confirm-step",
            raw: confirm.validation.adherence.reason,
            parsed: confirm.validation,
            latencyMs: 0,
          });
        } else {
          setLastResult({
            mode: "confirm-step",
            raw: confirm.segment.id,
            parsed: confirm.segment,
            latencyMs: 0,
          });
        }
        await Promise.all([refresh.run(), refresh.recording(), refresh.manifests(), refresh.operatorReadiness()]);
      })();
    } finally {
      setConfirmingStep(false);
    }
  };

  const verifyStep = async () => {
    setVerifying(true);
    try {
      await withControllerError(setError, async () => {
        const result = await kitchenVerifyStep();
        setLastResult({
          mode: "verify-step",
          raw: result.verification?.reasoning || "",
          parsed: result.verification,
          latencyMs: result.latencyMs,
        });
        refresh.run();
      })();
    } finally {
      setVerifying(false);
    }
  };

  const runAdherenceTick = async () => {
    setAdherenceChecking(true);
    try {
      await withControllerError(setError, async () => {
        const result = await kitchenRunAdherenceTick({ maxChecks: preset.supervisor.maxChecks });
        setLastAdherence(result);
        setLastResult({ mode: "adherence-tick", raw: result.adherence.reason, parsed: result, latencyMs: 0 });
        refresh.run();
      })();
    } finally {
      setAdherenceChecking(false);
    }
  };

  return { confirmStep, verifyStep, runAdherenceTick };
}
