import {
  kitchenRunSupervisorStart,
  kitchenRunSupervisorStop,
  type LabOSWorkflowPreset,
} from "../../../api";
import { withControllerError } from "./errorBoundary";
import { supervisorStartOptions } from "./presets";
import type { KitchenDemoRefresh, StateSetter } from "./types";
import { ensureGlassesVoiceBridge } from "./voiceBridge";

export function useSupervisorActions({
  refresh,
  preset,
  setError,
  setGuidedBusy,
  setSupervisorChanging,
}: {
  refresh: KitchenDemoRefresh;
  preset: LabOSWorkflowPreset;
  setError: StateSetter<string>;
  setGuidedBusy: StateSetter<string>;
  setSupervisorChanging: StateSetter<boolean>;
}) {
  const startSupervisor = withControllerError(setError, async () => {
    setSupervisorChanging(true);
    setGuidedBusy("supervisor");
    try {
      await ensureGlassesVoiceBridge();
      await kitchenRunSupervisorStart({ ...supervisorStartOptions(preset), immediate: false });
      await refresh.supervisor();
    } finally {
      setSupervisorChanging(false);
      setGuidedBusy("");
    }
  });

  const stopSupervisor = withControllerError(setError, async () => {
    setSupervisorChanging(true);
    setGuidedBusy("supervisor");
    try {
      await kitchenRunSupervisorStop();
      await refresh.supervisor();
    } finally {
      setSupervisorChanging(false);
      setGuidedBusy("");
    }
  });

  return { startSupervisor, stopSupervisor };
}
