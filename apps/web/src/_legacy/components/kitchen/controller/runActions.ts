import {
  kitchenCompleteStep,
  kitchenHandsFreeStart,
  kitchenOperatorAbort,
  kitchenOperatorBegin,
  kitchenOperatorSavePackage,
  kitchenRunPause,
  kitchenRunResume,
  kitchenSkipStep,
  kitchenUndoStep,
  type LabOSWorkflowPreset,
  defaultGlassesLiveCoachWsUrl,
} from "../../../api";
import { withControllerError } from "./errorBoundary";
import { protocolIdForPreset, supervisorStartOptions } from "./presets";
import type { KitchenDemoData, KitchenDemoRefresh, KitchenDemoView, StateSetter } from "./types";
import { currentGlassesIp } from "./voiceBridge";

export function useKitchenRunActions({
  data,
  refresh,
  preset,
  selectedProtocol,
  setSelectedProtocol,
  setView,
  setError,
  setGuidedBusy,
  setSavingManifest,
  setSavedManifestRef,
}: {
  data: KitchenDemoData;
  refresh: KitchenDemoRefresh;
  preset: LabOSWorkflowPreset;
  selectedProtocol: string;
  setSelectedProtocol: StateSetter<string>;
  setView: StateSetter<KitchenDemoView>;
  setError: StateSetter<string>;
  setGuidedBusy: StateSetter<string>;
  setSavingManifest: StateSetter<boolean>;
  setSavedManifestRef: StateSetter<string>;
}) {
  async function startProtocolRun(protocolId: string, opts?: { suppressStepCoach?: boolean }) {
    if (!protocolId) return;
    setSavedManifestRef("");
    await kitchenOperatorBegin(protocolId, opts);
    await Promise.all([refresh.preview(), refresh.recording(), refresh.run(), refresh.buttonConfirmStatus(), refresh.operatorReadiness()]);
    setView("run");
  }

  const startRunFromProtocols = withControllerError(setError, async () => {
    await startProtocolRun(selectedProtocol);
  });

  const startGuidedRun = async (protocolIdOverride?: string) => {
    await withControllerError(setError, async () => {
      const protocolId = protocolIdForPreset(data.protocols, preset, protocolIdOverride || selectedProtocol);
      if (!protocolId) return;
      setSelectedProtocol(protocolId);
      setSavedManifestRef("");
      setGuidedBusy("run");
      try {
        if (data.featureFlags?.handsFreeEnabled && data.featureFlags.realtimeSupervisorEnabled) {
          await kitchenHandsFreeStart({
            protocolId,
            glassesIp: await currentGlassesIp().catch(() => ""),
            wsUrl: defaultGlassesLiveCoachWsUrl(),
            playback: true,
            requireVoice: true,
            supervisor: { ...supervisorStartOptions(preset), immediate: false },
          });
        } else {
          await kitchenOperatorBegin(protocolId, { suppressStepCoach: true });
        }
        setView("guided");
        await Promise.all([
          refresh.preview(),
          refresh.recording(),
          refresh.run(),
          refresh.supervisor(),
          refresh.buttonConfirmStatus(),
          refresh.operatorReadiness(),
        ]);
      } finally {
        setGuidedBusy("");
      }
    })();
  };

  const confirmAbort = async () => {
    await withControllerError(setError, async () => {
      setGuidedBusy("stop-run");
      try {
        await kitchenOperatorAbort("operator requested stop");
        await Promise.all([refresh.run(), refresh.recording(), refresh.manifests(), refresh.buttonConfirmStatus(), refresh.operatorReadiness()]);
        setView("guided");
      } finally {
        setGuidedBusy("");
      }
    })();
  };

  const skipStep = withControllerError(setError, async () => {
    await kitchenSkipStep();
    refresh.run();
  });

  const completeStep = withControllerError(setError, async () => {
    await kitchenCompleteStep();
    await Promise.all([refresh.run(), refresh.manifests()]);
  });

  const undoStep = withControllerError(setError, async () => {
    await kitchenUndoStep("operator requested redo");
    await Promise.all([refresh.run(), refresh.manifests()]);
  });

  const saveManifest = withControllerError(setError, async () => {
    setSavingManifest(true);
    setSavedManifestRef("");
    try {
      const result = await kitchenOperatorSavePackage(data.run?.id);
      setSavedManifestRef(result.result.manifestRef || "");
      await Promise.all([refresh.manifests(), refresh.buttonConfirmStatus(), refresh.operatorReadiness()]);
    } finally {
      setSavingManifest(false);
    }
  });

  const pauseRun = withControllerError(setError, async () => {
    await kitchenRunPause();
    refresh.run();
  });

  const resumeRun = withControllerError(setError, async () => {
    await kitchenRunResume();
    refresh.run();
  });

  return {
    startRunFromProtocols,
    startGuidedRun,
    confirmAbort,
    skipStep,
    completeStep,
    undoStep,
    saveManifest,
    pauseRun,
    resumeRun,
  };
}
