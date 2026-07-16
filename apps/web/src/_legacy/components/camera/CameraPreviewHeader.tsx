import type { PreviewHealth, StreamConfig } from "../../api";
import { StreamControls } from "./StreamControls";
import { metricColor, type CameraPreviewStatus } from "./types";

export function CameraPreviewHeader({
  advanced,
  applying,
  clientFps,
  configDirty,
  health,
  latencyMs,
  onApplyConfig,
  onStart,
  onStop,
  setShowPlots,
  setStreamConfig,
  showPlots,
  status,
  streamConfig,
}: {
  advanced: boolean;
  applying: boolean;
  clientFps: number;
  configDirty: boolean;
  health: PreviewHealth | null;
  latencyMs: number | null;
  onApplyConfig: () => void;
  onStart: () => void;
  onStop: () => void;
  setShowPlots: (value: boolean | ((prev: boolean) => boolean)) => void;
  setStreamConfig: (value: StreamConfig | ((prev: StreamConfig) => StreamConfig)) => void;
  showPlots: boolean;
  status: CameraPreviewStatus;
  streamConfig: StreamConfig;
}) {
  const serverFps = health?.fps ?? 0;
  const fpsColor = metricColor(serverFps, 10, 5);
  const clientFpsColor = metricColor(clientFps, 10, 5);
  const latencyColor = (latencyMs ?? 0) < 100 ? "#22c55e" : (latencyMs ?? 0) < 300 ? "#eab308" : "#ef4444";

  return (
    <div className="card">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h2 className="text-accentText font-semibold">Camera Preview</h2>
        {status === "streaming" ? (
          <button className="btn-danger text-sm" onClick={onStop}>Stop</button>
        ) : (
          <button className="btn-primary text-sm" onClick={onStart} disabled={status !== "idle"}>
            {status === "starting" ? "Starting..." : "Start Stream"}
          </button>
        )}

        {status === "streaming" && (
          <div className="ml-auto flex items-center gap-4 text-xs font-mono">
            <span className="text-muted">
              Server: <span className="font-bold" style={{ color: fpsColor }}>{serverFps.toFixed(1)} fps</span>
            </span>
            <span className="text-muted">
              Client: <span className="font-bold" style={{ color: clientFpsColor }}>{clientFps} fps</span>
            </span>
            <span className="text-muted">
              Latency: <span className="font-bold" style={{ color: latencyColor }}>
                {latencyMs !== null ? `${latencyMs}ms` : "-"}
              </span>
            </span>
            <span className="text-muted">
              Frames: <span className="text-fg">{health?.frameCount ?? 0}</span>
            </span>
            {advanced && (
              <button
                className="text-muted hover:text-fg transition-colors"
                onClick={() => setShowPlots((prev) => !prev)}
                title={showPlots ? "Hide plots" : "Show plots"}
              >
                {showPlots ? "Hide Charts" : "Show Charts"}
              </button>
            )}
          </div>
        )}
      </div>

      {advanced && <div className="pt-3 border-t border-border/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted font-medium uppercase tracking-wide">Stream Settings</span>
          <span className="text-xs text-subtle">
            ({streamConfig.stream_width}x{streamConfig.stream_height} @ {streamConfig.stream_fps}fps, Q{streamConfig.stream_jpeg_quality})
          </span>
        </div>
        <StreamControls
          config={streamConfig}
          onChange={(updates) => setStreamConfig((current) => ({ ...current, ...updates }))}
          onApply={onApplyConfig}
          dirty={configDirty}
          applying={applying}
        />
      </div>}
    </div>
  );
}
