import type { PreviewHealth, StreamConfig } from "../../api";
import { Sparkline } from "./Sparkline";

export function CameraPerformancePanel({
  clientFpsHistory,
  fpsHistory,
  frameSizeHistory,
  health,
  latencyHistory,
  streamConfig,
}: {
  clientFpsHistory: number[];
  fpsHistory: number[];
  frameSizeHistory: number[];
  health: PreviewHealth | null;
  latencyHistory: number[];
  streamConfig: StreamConfig;
}) {
  return (
    <div className="card space-y-4">
      <h3 className="text-xs font-medium text-muted uppercase tracking-wide">Live Performance</h3>

      <Sparkline
        data={fpsHistory}
        label="Server FPS"
        unit=" fps"
        color="#22c55e"
        min={0}
        max={Math.max(streamConfig.stream_fps + 5, ...fpsHistory, 20)}
        height={80}
      />

      <Sparkline
        data={clientFpsHistory}
        label="Client FPS"
        unit=" fps"
        color="#3b82f6"
        min={0}
        max={Math.max(streamConfig.stream_fps + 5, ...clientFpsHistory, 20)}
        height={80}
      />

      <Sparkline
        data={latencyHistory}
        label="Round-trip Latency"
        unit="ms"
        color="#eab308"
        min={0}
        height={80}
      />

      <Sparkline
        data={frameSizeHistory}
        label="Frames per Poll"
        unit=""
        color="#a855f7"
        min={0}
        height={80}
      />

      <div className="border-t border-border/20 pt-3 space-y-1 text-xs font-mono">
        <StatRow label="Total frames" value={health?.frameCount ?? 0} />
        <StatRow label="Target FPS" value={streamConfig.stream_fps} />
        <StatRow label="Resolution" value={`${streamConfig.stream_width}x${streamConfig.stream_height}`} />
        <StatRow label="JPEG quality" value={`${streamConfig.stream_jpeg_quality}%`} />
        {fpsHistory.length > 5 && (
          <>
            <StatRow label="FPS stability" value={fpsVarianceLabel(fpsHistory)} />
            <StatRow label="Avg latency" value={`${average(latencyHistory).toFixed(0)}ms`} />
          </>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fpsVarianceLabel(fpsHistory: number[]) {
  const recent = fpsHistory.slice(-10);
  const mean = average(recent);
  const variance = recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recent.length;
  const cv = mean > 0 ? (Math.sqrt(variance) / mean * 100).toFixed(0) : "-";
  return `${cv}% variance`;
}
