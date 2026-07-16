export type CameraPreviewStatus = "idle" | "starting" | "streaming" | "stopping";

export function metricColor(value: number, good: number, warn: number) {
  if (value > good) return "#22c55e";
  if (value > warn) return "#eab308";
  return "#ef4444";
}
