import { labosLaunch, previewStart, updateButtonMappings } from "../../../api";
import { withControllerError } from "./errorBoundary";
import type { KitchenDemoRefresh, StateSetter } from "./types";
import { ensureSensorBridge } from "./voiceBridge";

export function useDevicePrepActions({
  refresh,
  setError,
  setGuidedBusy,
}: {
  refresh: KitchenDemoRefresh;
  setError: StateSetter<string>;
  setGuidedBusy: StateSetter<string>;
}) {
  const launchLabos = withControllerError(setError, async () => {
    setGuidedBusy("labos");
    try {
      await labosLaunch();
      await refresh.labos();
    } finally {
      setGuidedBusy("");
    }
  });

  const startPreview = withControllerError(setError, async () => {
    setGuidedBusy("preview");
    try {
      await previewStart();
      await Promise.all([
        refresh.preview(),
        refresh.operatorReadiness?.(),
      ]);
    } finally {
      setGuidedBusy("");
    }
  });

  const setButtonConfirm = withControllerError(setError, async () => {
    setGuidedBusy("button-confirm");
    try {
      await updateButtonMappings({ camera_short: "protocol_confirm_step" });
      await ensureSensorBridge();
      await Promise.all([
        refresh.buttonMappings?.(),
        refresh.buttonConfirmStatus?.(),
      ]);
    } finally {
      setGuidedBusy("");
    }
  });

  return { launchLabos, startPreview, setButtonConfirm };
}
