import { useEffect, useRef, useState } from "react";
import {
  fetchSettings,
  getCameraCapabilities,
  previewHealth,
  previewStart,
  previewStop,
  setManualCameraParams,
  updateStreamConfig,
  type CameraCapabilities,
  type ManualCameraParams,
  type PreviewHealth,
  type StreamConfig,
} from "../../api";
import { pushHistory } from "./Sparkline";
import type { CameraPreviewStatus } from "./types";

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  stream_width: 480,
  stream_height: 360,
  stream_jpeg_quality: 45,
  stream_fps: 6,
};

function streamConfigFromSettings(settings: any): StreamConfig {
  return {
    stream_width: settings.stream_width || DEFAULT_STREAM_CONFIG.stream_width,
    stream_height: settings.stream_height || DEFAULT_STREAM_CONFIG.stream_height,
    stream_jpeg_quality: settings.stream_jpeg_quality || DEFAULT_STREAM_CONFIG.stream_jpeg_quality,
    stream_fps: settings.stream_fps || DEFAULT_STREAM_CONFIG.stream_fps,
  };
}

export function useCameraPreview(connected: boolean) {
  const [status, setStatus] = useState<CameraPreviewStatus>("idle");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<PreviewHealth | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [clientFps, setClientFps] = useState(0);
  const [streamConfig, setStreamConfig] = useState<StreamConfig>(DEFAULT_STREAM_CONFIG);
  const [savedConfig, setSavedConfig] = useState<StreamConfig>(DEFAULT_STREAM_CONFIG);
  const [applying, setApplying] = useState(false);
  const [caps, setCaps] = useState<CameraCapabilities | null>(null);
  const [manualParams, setManualParams] = useState<ManualCameraParams>({});
  const [showManual, setShowManual] = useState(false);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const [clientFpsHistory, setClientFpsHistory] = useState<number[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [frameSizeHistory, setFrameSizeHistory] = useState<number[]>([]);
  const [showPlots, setShowPlots] = useState(true);

  const healthRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameCountRef = useRef(0);
  const lastHealthPollAtRef = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const manualStopRef = useRef(false);
  const autoStartAttemptRef = useRef(false);

  const configDirty = JSON.stringify(streamConfig) !== JSON.stringify(savedConfig);

  function resetMetrics() {
    setHealth(null);
    setLatencyMs(null);
    lastFrameCountRef.current = 0;
    lastHealthPollAtRef.current = null;
    setClientFps(0);
    setFpsHistory([]);
    setClientFpsHistory([]);
    setLatencyHistory([]);
    setFrameSizeHistory([]);
  }

  function stopHealthPolling() {
    if (healthRef.current) {
      clearInterval(healthRef.current);
      healthRef.current = null;
    }
  }

  function startHealthPolling() {
    stopHealthPolling();
    healthRef.current = setInterval(async () => {
      try {
        const start = performance.now();
        const nextHealth = await previewHealth();
        const elapsed = performance.now() - start;
        setHealth(nextHealth);
        setLatencyMs(Math.round(elapsed));
        setFpsHistory((prev) => pushHistory(prev, nextHealth.fps));
        setLatencyHistory((prev) => pushHistory(prev, Math.round(elapsed)));

        const now = performance.now();
        const delta = nextHealth.frameCount - lastFrameCountRef.current;
        const elapsedSec = lastHealthPollAtRef.current
          ? Math.max(0.001, (now - lastHealthPollAtRef.current) / 1000)
          : 0;
        lastFrameCountRef.current = nextHealth.frameCount;
        lastHealthPollAtRef.current = now;

        if (elapsedSec > 0 && delta >= 0) {
          const derivedClientFps = delta / elapsedSec;
          setClientFps(Math.round(derivedClientFps * 10) / 10);
          setClientFpsHistory((prev) => pushHistory(prev, derivedClientFps));
          setFrameSizeHistory((prev) => pushHistory(prev, delta));
        }
      } catch {
        // Health polling should not tear down a running MJPEG stream.
      }
    }, 2000);
  }

  async function start() {
    manualStopRef.current = false;
    autoStartAttemptRef.current = true;
    setStatus("starting");
    setError("");
    resetMetrics();
    try {
      const startResult = await previewStart();
      setHealth(startResult);
      setStatus("streaming");
      startHealthPolling();
    } catch (e: any) {
      setError(e.message || "Failed to start stream");
      setStatus("idle");
    }
  }

  async function stop() {
    manualStopRef.current = true;
    autoStartAttemptRef.current = false;
    setStatus("stopping");
    stopHealthPolling();
    try {
      await previewStop();
    } catch {}
    resetMetrics();
    setStatus("idle");
  }

  async function applyConfig() {
    setApplying(true);
    try {
      await updateStreamConfig(streamConfig);
      setSavedConfig({ ...streamConfig });
      if (status === "streaming") {
        await stop();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await start();
      }
    } catch (e: any) {
      setError(`Config update failed: ${e.message}`);
    }
    setApplying(false);
  }

  async function loadCapabilities() {
    try {
      const nextCaps = await getCameraCapabilities();
      setCaps(nextCaps);
      if (nextCaps.manual_mode) {
        setManualParams((prev) => ({
          ...prev,
          manual_mode: nextCaps.manual_mode,
          exposure_ns: nextCaps.current_exposure_ns,
          iso: nextCaps.current_iso,
          ae_compensation: nextCaps.current_ae_comp,
          focus_distance: nextCaps.current_focus_distance,
        }));
      }
    } catch (e: any) {
      setError(`Failed to load capabilities: ${e.message}`);
    }
  }

  async function applyManual() {
    try {
      await setManualCameraParams(manualParams);
    } catch (e: any) {
      setError(`Manual params failed: ${e.message}`);
    }
  }

  useEffect(() => {
    if (!connected) {
      stopHealthPolling();
      resetMetrics();
      manualStopRef.current = false;
      autoStartAttemptRef.current = false;
      setStatus("idle");
      return;
    }
    fetchSettings()
      .then((settings) => {
        const cfg = streamConfigFromSettings(settings);
        setStreamConfig(cfg);
        setSavedConfig(cfg);
      })
      .catch(() => {});
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    previewHealth()
      .then((nextHealth) => {
        if (cancelled) return;
        setHealth(nextHealth);
        if (nextHealth.streaming || nextHealth.frameReachable) {
          setStatus("streaming");
          startHealthPolling();
          return;
        }
        if (!manualStopRef.current && !autoStartAttemptRef.current) {
          autoStartAttemptRef.current = true;
          setStatus("starting");
          setError("");
          previewStart()
            .then((startResult) => {
              if (cancelled) return;
              setHealth(startResult);
              setStatus("streaming");
              startHealthPolling();
            })
            .catch((error: any) => {
              if (cancelled) return;
              setError(error?.message || "Failed to start stream");
              setStatus("idle");
              autoStartAttemptRef.current = false;
            });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected]);

  useEffect(() => () => stopHealthPolling(), []);

  return {
    applying,
    applyConfig,
    applyManual,
    caps,
    clientFps,
    clientFpsHistory,
    configDirty,
    error,
    fpsHistory,
    frameSizeHistory,
    health,
    imgRef,
    latencyHistory,
    latencyMs,
    loadCapabilities,
    manualParams,
    setError,
    setManualParams,
    setShowManual,
    setShowPlots,
    setStreamConfig,
    showManual,
    showPlots,
    start,
    status,
    stop,
    streamConfig,
  };
}
