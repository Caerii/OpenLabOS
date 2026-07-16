/**
 * DevicePreview — live camera feed from the registered glasses adapter.
 *
 * Strategy:
 *   1. Try the native MJPEG multipart stream. The browser decodes
 *      multipart/x-mixed-replace itself, so the JS path is zero-copy.
 *   2. If the stream returns an error (the on-device server does not
 *      always bind the MJPEG bridge on cold start), fall back to a
 *      polled fetch + img.decode() loop that avoids canvas copies.
 *   3. Surface failure modes plainly — preview unavailable / camera
 *      not streaming / device unreachable — instead of pretending it
 *      works.
 *
 * The component owns the camera-start/stop lifecycle: when mounted,
 * it broadcasts ACTION_START_PREVIEW; on unmount or pause it broadcasts
 * ACTION_STOP_PREVIEW.
 */
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STREAM_URL = "/api/device/api/preview/stream";
const FRAME_URL = "/api/device/api/preview/frame";
const HEALTH_URL = "/api/device/api/preview/health";
const CAMERA_START = "/api/device/api/camera/start";
const CAMERA_STOP = "/api/device/api/camera/stop";

interface PreviewHealth {
  ok: boolean;
  fps: number;
  frameCount: number;
  streaming: boolean;
}

type PreviewStatus =
  | { kind: "starting" }
  | { kind: "streaming"; mode: "mjpeg" | "polling"; fps: number; frameCount: number }
  | { kind: "stalled"; reason: string }
  | { kind: "paused" }
  | { kind: "error"; detail: string };

interface DevicePreviewProps {
  className?: string;
  /** Polling cadence for the fallback JPEG endpoint, in ms. */
  pollIntervalMs?: number;
  /** Whether to broadcast camera start/stop on mount/unmount. */
  manageCamera?: boolean;
  /** Pause toggling control surfaces (e.g. when the run page is on a step). */
  paused?: boolean;
}

export function DevicePreview({
  className,
  pollIntervalMs = 250,
  manageCamera = true,
  paused = false,
}: DevicePreviewProps) {
  const [status, setStatus] = useState<PreviewStatus>({ kind: "starting" });
  const [mode, setMode] = useState<"mjpeg" | "polling">("mjpeg");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Camera lifecycle: ask the device to broadcast START_PREVIEW once on mount,
  // STOP_PREVIEW on unmount or when paused. The on-device camera APK takes a
  // few hundred ms to bind its bridge port; we tolerate that with a re-probe.
  useEffect(() => {
    if (!manageCamera) return;
    let cancelled = false;
    const start = async () => {
      try {
        await fetch(CAMERA_START, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
      } catch {
        /* surfaced through /preview/health below */
      }
      if (cancelled) return;
    };
    start();
    return () => {
      cancelled = true;
      fetch(CAMERA_STOP, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [manageCamera]);

  // Health probe — drives mode selection (mjpeg vs polling) and surfaces
  // "stalled" when the on-device bridge isn't binding.
  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let stallCount = 0;
    const tick = async () => {
      try {
        const start = performance.now();
        const res = await fetch(`${HEALTH_URL}?lite=1`);
        if (!res.ok) {
          if (!cancelled) setStatus({ kind: "stalled", reason: `health ${res.status}` });
          return;
        }
        const h = (await res.json()) as PreviewHealth & { streamFrameAgeMs?: number };
        if (!cancelled) {
          if (typeof h.streamFrameAgeMs === "number" && Number.isFinite(h.streamFrameAgeMs)) {
            setLatencyMs(Math.round(h.streamFrameAgeMs));
          } else {
            setLatencyMs(Math.round(performance.now() - start));
          }
        }
        if (cancelled) return;
        if (!h.ok || !h.streaming) {
          stallCount++;
          if (stallCount > 6) {
            setStatus({
              kind: "stalled",
              reason: "camera bridge not streaming on this firmware",
            });
          }
          // Even if /preview/health says streaming:false, the underlying MJPEG
          // bridge may still emit; polling fallback will pick it up.
          setMode((m) => (m === "mjpeg" ? "polling" : m));
          return;
        }
        stallCount = 0;
        setStatus({
          kind: "streaming",
          mode,
          fps: h.fps ?? 0,
          frameCount: h.frameCount ?? 0,
        });
      } catch (e) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, paused]);

  // Polling fallback: fetch a JPEG, decode off-main-thread, swap into <img>
  // via blob URL. We rotate the URL to free the previous one immediately so
  // GC pressure stays low even at 4 fps over a long session.
  useEffect(() => {
    if (mode !== "polling" || paused) return;
    let cancelled = false;
    let frames = 0;
    let firstAt = performance.now();

    const tick = async () => {
      try {
        const start = performance.now();
        const res = await fetch(FRAME_URL, { cache: "no-store" });
        if (!res.ok) return;
        const blob = await res.blob();
        if (!cancelled) setLatencyMs(Math.round(performance.now() - start));
        if (cancelled) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const img = imgRef.current;
        if (!img) return;
        img.src = url;
        // decode() resolves once the bitmap is ready; doing it before the next
        // frame swap means we never block the main thread on paint.
        try {
          await img.decode();
        } catch {
          /* image error — swallow, next frame will retry */
        }
        frames++;
        const elapsed = (performance.now() - firstAt) / 1000;
        const fps = elapsed > 0 ? frames / elapsed : 0;
        if (cancelled) return;
        setStatus({ kind: "streaming", mode: "polling", fps, frameCount: frames });
        if (frames >= 60) {
          // Reset window to give the user a recent FPS estimate, not a
          // session-long average.
          frames = 0;
          firstAt = performance.now();
        }
      } catch (e) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };

    const id = setInterval(tick, pollIntervalMs);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [mode, pollIntervalMs, paused]);

  const onMjpegError = useCallback(() => {
    // Native MJPEG failed — switch to polling.
    setMode("polling");
  }, []);

  const overlay = useMemo(() => {
    if (paused) return { label: "paused", tone: "warn" as const };
    switch (status.kind) {
      case "starting":
        return { label: "warming camera…", tone: "muted" as const };
      case "streaming":
        return {
          label: `${status.mode} · ${status.fps.toFixed(1)} fps · ${latencyMs !== null ? `${latencyMs} ms` : "…"} · ${status.frameCount} frames`,
          tone: "ok" as const,
        };
      case "stalled":
        return { label: status.reason, tone: "warn" as const };
      case "paused":
        return { label: "paused", tone: "warn" as const };
      case "error":
        return { label: status.detail, tone: "bad" as const };
    }
  }, [status, paused, latencyMs]);

  return (
    <div
      className={[
        "relative aspect-video rounded-xl border border-white/5 overflow-hidden bg-surface-3/80",
        className ?? "",
      ].join(" ")}
    >
      {mode === "mjpeg" && !paused && (
        <img
          src={STREAM_URL}
          alt="device preview"
          className="absolute inset-0 w-full h-full object-cover"
          onError={onMjpegError}
        />
      )}
      {mode === "polling" && (
        <img
          ref={imgRef}
          alt="device preview"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Diagonal scan-line shimmer makes "live" feel live. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(120deg, transparent 0%, rgba(56,189,167,0.08) 50%, transparent 100%)",
        }}
        animate={{ backgroundPosition: ["0% 0%", "200% 200%"] }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />

      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        className="absolute inset-x-0 bottom-0 px-4 py-2 flex items-center justify-between text-xs font-mono"
      >
        <span
          className={[
            "px-2 py-0.5 rounded",
            overlay.tone === "ok"
              ? "bg-accent-400/20 text-accent-300 ring-1 ring-accent-400/40"
              : overlay.tone === "warn"
              ? "bg-warn-400/20 text-warn-400 ring-1 ring-warn-400/40"
              : overlay.tone === "bad"
              ? "bg-bad-400/20 text-bad-400 ring-1 ring-bad-400/40"
              : "bg-surface-2/60 text-ink-low ring-1 ring-white/10",
          ].join(" ")}
        >
          {overlay.label}
        </span>
        <span className="text-ink-low">/api/device/api/preview</span>
      </motion.div>
    </div>
  );
}
