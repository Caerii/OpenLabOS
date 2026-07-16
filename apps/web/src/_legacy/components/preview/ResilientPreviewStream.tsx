import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { previewClientTrace } from "../../api";
import { mergeWifiAuth } from "../../api/core";
import { formatPreviewLatency } from "./usePreviewFrameLatency";
import {
  PreviewTransportClient,
  H264AnnexBPlayer,
  webCodecsH264Supported,
  resolveAdaptivePreviewConfig,
} from "../../../lib/preview";

const SILENT_RECONNECT_MS = 12_000;
const ERROR_RECONNECT_MS = 2_500;

function mjpegStreamUrl(base: string, version: number) {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}clientStream=${version}`;
}

export function ResilientPreviewStream({
  connected,
  streaming,
  frameCount,
  imgRef,
  alt = "Live glasses camera stream",
  className = "",
  imageClassName = "h-full w-full object-contain",
  waitingTitle = "Waiting for live frames",
  waitingMessage = "Wait until frames are live before trusting this view.",
  errorMessage = "Preview connection stalled. Reconnecting the live view.",
  disconnectedMessage = "Connect glasses to view the camera stream.",
  showCornerLabel = false,
  showStreamMetrics = false,
  latencyMs = null,
  onStreamFrameMs,
}: {
  connected: boolean;
  streaming: boolean;
  frameCount: number;
  imgRef?: RefObject<HTMLImageElement>;
  alt?: string;
  className?: string;
  imageClassName?: string;
  waitingTitle?: string;
  waitingMessage?: string;
  errorMessage?: string;
  disconnectedMessage?: string;
  showCornerLabel?: boolean;
  showStreamMetrics?: boolean;
  latencyMs?: number | null;
  onStreamFrameMs?: (intervalMs: number | null) => void;
}) {
  const adaptive = useMemo(() => resolveAdaptivePreviewConfig({ webCodecsH264: webCodecsH264Supported() }), []);
  const client = useMemo(
    () => new PreviewTransportClient(adaptive.config, { tier: "host", healthLite: true }),
    [adaptive.config],
  );
  const useH264 = adaptive.config.transport === "h264-annexb-http";

  const [version, setVersion] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamFrameMs, setStreamFrameMs] = useState<number | null>(null);
  const lastFrameCountRef = useRef(frameCount);
  const lastFrameAdvanceAtRef = useRef(performance.now());
  const lastReconnectAtRef = useRef(performance.now());
  const lastStreamFrameAtRef = useRef<number | null>(null);
  const mjpegSrc = useMemo(() => mjpegStreamUrl(client.streamUrl(), version), [client, version]);
  const h264Src = useMemo(() => client.streamUrl(), [client]);

  const reconnect = useCallback((minimumDelayMs: number) => {
    const now = performance.now();
    if (now - lastReconnectAtRef.current < minimumDelayMs) return;
    lastReconnectAtRef.current = now;
    setVersion((value) => value + 1);
  }, []);

  const resetStreamTiming = useCallback(() => {
    lastStreamFrameAtRef.current = null;
    setStreamFrameMs(null);
    onStreamFrameMs?.(null);
  }, [onStreamFrameMs]);

  const recordFrameInterval = useCallback(() => {
    const now = performance.now();
    if (lastStreamFrameAtRef.current !== null) {
      const intervalMs = Math.round(now - lastStreamFrameAtRef.current);
      setStreamFrameMs(intervalMs);
      onStreamFrameMs?.(intervalMs);
      previewClientTrace({ clientDisplayMs: intervalMs }).catch(() => undefined);
    }
    lastStreamFrameAtRef.current = now;
    setStreamError(null);
  }, [onStreamFrameMs]);

  useEffect(() => {
    if (!connected) {
      setStreamError(null);
      resetStreamTiming();
      return;
    }
    lastFrameCountRef.current = frameCount;
    lastFrameAdvanceAtRef.current = performance.now();
    lastReconnectAtRef.current = performance.now();
    resetStreamTiming();
    setVersion((value) => value + 1);
    setStreamError(null);
  }, [connected, resetStreamTiming]);

  useEffect(() => {
    if (!streaming) resetStreamTiming();
  }, [resetStreamTiming, streaming]);

  useEffect(() => {
    if (frameCount > lastFrameCountRef.current) {
      lastFrameCountRef.current = frameCount;
      lastFrameAdvanceAtRef.current = performance.now();
      if (streamError) setStreamError(null);
    }
  }, [frameCount, streamError]);

  useEffect(() => {
    if (!connected || !streaming) return;
    const interval = window.setInterval(() => {
      const silentForMs = performance.now() - lastFrameAdvanceAtRef.current;
      if (silentForMs > SILENT_RECONNECT_MS) {
        setStreamError(errorMessage);
        reconnect(SILENT_RECONNECT_MS);
      }
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [connected, errorMessage, reconnect, streaming]);

  const displayedLatencyMs = latencyMs ?? streamFrameMs;

  return (
    <div className={`relative aspect-video bg-black ${className}`}>
      {connected ? (
        <>
          {useH264 ? (
            <H264AnnexBPlayer
              src={h264Src}
              connected={connected}
              streaming={streaming}
              className={imageClassName}
              fetchHeaders={mergeWifiAuth({})}
              onFrame={recordFrameInterval}
              onError={(message) => {
                setStreamError(message);
                reconnect(ERROR_RECONNECT_MS);
              }}
            />
          ) : (
            <img
              ref={imgRef}
              src={mjpegSrc}
              alt={alt}
              className={imageClassName}
              onLoad={recordFrameInterval}
              onError={() => {
                setStreamError(errorMessage);
                reconnect(ERROR_RECONNECT_MS);
              }}
            />
          )}
          {(streamError || !streaming) && (
            <div className="absolute inset-x-3 bottom-3 rounded-lg border border-amber-300/50 bg-black/75 p-2 text-[11px] text-white shadow-lg sm:p-3 sm:text-xs">
              <div className="font-semibold">{streamError ? "Preview reconnecting" : waitingTitle}</div>
              <div className="mt-0.5 text-white/80">{streamError || waitingMessage}</div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
          {disconnectedMessage}
        </div>
      )}
      {showCornerLabel && (
        <div className="absolute left-3 top-3 rounded-lg bg-black/65 px-2 py-1 text-[11px] text-white">
          {useH264 ? "H.264" : "MJPEG"} · {adaptive.profileId}
        </div>
      )}
      {showStreamMetrics && streaming && (
        <div className="absolute right-3 top-3 rounded-lg bg-black/75 px-2 py-1 font-mono text-[11px] text-white tabular-nums">
          {formatPreviewLatency(displayedLatencyMs)}
        </div>
      )}
    </div>
  );
}
