/** Operator-facing status copy — plain language, no pipeline jargon. */

export type OperatorStreamTone = "live" | "connecting" | "offline" | "delayed";

export function operatorPreviewStatus(opts: {
  connected: boolean;
  previewReady: boolean;
  streaming?: boolean;
  latencyMs?: number | null;
}): { label: string; tone: OperatorStreamTone } {
  if (!opts.connected) return { label: "Glasses offline", tone: "offline" };
  if (!opts.previewReady) {
    return opts.streaming
      ? { label: "Connecting camera", tone: "connecting" }
      : { label: "Camera not started", tone: "offline" };
  }
  if (opts.latencyMs !== null && opts.latencyMs !== undefined) {
    if (opts.latencyMs > 800) return { label: "Camera live · delayed", tone: "delayed" };
    if (opts.latencyMs > 350) return { label: "Camera live · slight delay", tone: "live" };
  }
  return { label: "Camera live", tone: "live" };
}

export function operatorLabosStatus(labosReady: boolean, connected: boolean): string {
  if (!connected) return "Connect glasses first";
  return labosReady ? "Lab app running" : "Lab app not running";
}

export function operatorRecordingStatus(active: boolean): string {
  return active ? "Recording this run" : "Will record when run starts";
}

export function operatorRunProgress(step: number, total: number): string {
  return `Step ${step} of ${total}`;
}

export function operatorReadinessHeadline(readyCount: number, total: number): string {
  if (readyCount >= total) return "Ready to start";
  const remaining = total - readyCount;
  return remaining === 1 ? "One step left before you can start" : `${remaining} steps left before you can start`;
}

export function operatorFixNextTitle(blockerLabel: string): string {
  return `Next: ${blockerLabel}`;
}
