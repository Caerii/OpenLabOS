import { useEffect, useState } from "react";
import { getPreviewFrameUrl, mergeWifiAuth, previewClientTrace, previewHealth } from "../../api";

const POLL_MS = 1000;

function cacheBustUrl(base: string) {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}t=${Date.now()}`;
}

async function measureFrameFetchLatencyMs(): Promise<number> {
  const start = performance.now();
  const response = await fetch(cacheBustUrl(getPreviewFrameUrl()), {
    cache: "no-store",
    headers: mergeWifiAuth({}),
  });
  if (!response.ok) {
    throw new Error(`Preview frame HTTP ${response.status}`);
  }
  await response.arrayBuffer();
  return Math.round(performance.now() - start);
}

async function measurePreviewLatencyMs(): Promise<number | null> {
  const health = await previewHealth({ lite: true });
  const frameAgeMs = health.streamFrameAgeMs;
  if (frameAgeMs !== undefined && Number.isFinite(frameAgeMs) && frameAgeMs >= 0) {
    const rounded = Math.round(frameAgeMs);
    previewClientTrace({ clientDisplayMs: rounded, glassToGlassMs: rounded }).catch(() => {});
    return rounded;
  }

  try {
    const fetchMs = await measureFrameFetchLatencyMs();
    previewClientTrace({ clientDisplayMs: fetchMs, glassToGlassMs: fetchMs }).catch(() => {});
    return fetchMs;
  } catch {
    return null;
  }
}

export function usePreviewFrameLatency(enabled: boolean): number | null {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLatencyMs(null);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const next = await measurePreviewLatencyMs();
        if (!cancelled && next !== null) setLatencyMs(next);
      } catch {
        // Keep the last measured value while the stream recovers.
      }
    }

    poll();
    const interval = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return latencyMs;
}

export function formatPreviewLatency(latencyMs: number | null) {
  if (latencyMs === null) return "…";
  return `${latencyMs} ms`;
}
