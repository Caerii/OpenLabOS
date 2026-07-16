import type { CameraCapabilities, ManualCameraParams } from "../../api";
import { ManualControls } from "./ManualControls";

export function ManualSensorCard({
  caps,
  manualParams,
  onApplyManual,
  onLoadCaps,
  setManualParams,
  setShowManual,
  showManual,
}: {
  caps: CameraCapabilities | null;
  manualParams: ManualCameraParams;
  onApplyManual: () => void;
  onLoadCaps: () => void;
  setManualParams: (value: ManualCameraParams | ((prev: ManualCameraParams) => ManualCameraParams)) => void;
  setShowManual: (value: boolean | ((prev: boolean) => boolean)) => void;
  showManual: boolean;
}) {
  return (
    <div className="card">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => {
          setShowManual((prev) => !prev);
          if (!caps) onLoadCaps();
        }}
      >
        <span className="text-xs text-muted font-medium uppercase tracking-wide">
          Manual Sensor Controls
        </span>
        <span className="text-xs text-subtle">{showManual ? "v" : ">"}</span>
      </button>
      {showManual && (
        <div className="mt-3 pt-3 border-t border-border/20">
          <ManualControls
            caps={caps}
            params={manualParams}
            onChange={(updates) => setManualParams((prev) => ({ ...prev, ...updates }))}
            onApply={onApplyManual}
            onLoadCaps={onLoadCaps}
          />
        </div>
      )}
    </div>
  );
}
