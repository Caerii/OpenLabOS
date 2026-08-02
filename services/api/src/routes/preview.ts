import { Router, Request, Response } from "express";
import http from "node:http";
import { asyncRoute } from "../lib/http.js";
import { previewFrameBuffer } from "../preview/rolling-frame-buffer.js";
import { getRecentStreamJpegIfFresh } from "../preview/mjpeg-last-frame.js";
import { sharedPreviewStreamHub } from "../preview/shared-preview-stream.js";
import {
  applyManualCameraParams,
  applyPreviewProtocolToDevice,
  bootPreviewStreamOrThrow,
  CAMERA_ACTIONS,
  ensurePortForward,
  fetchCameraCapabilities,
  fetchDeviceMetrics,
  HEALTH_FALLBACK,
  LOCAL_PREVIEW_HOST,
  previewHealthSnapshot,
  previewHealthSnapshotLite,
  PREVIEW_PORT,
  refreshNativeRecordingStatus,
  resetPreviewHealthEstimator,
  sendCameraCommand,
  startNativeRecording,
  stopNativeRecording,
  toggleNativeRecording,
  warmKitchenProtocolCamera,
} from "../preview/device-preview.js";
import {
  applyPreviewProfile,
  getActivePreviewProfileId,
  getPreviewProtocolConfig,
  previewProtocolCatalog,
  setPreviewProtocolConfig,
} from "../preview/preview-protocol-config.js";
import {
  previewEnergySnapshot,
  recordEnergyCalibrationSample,
  setEnergyModelCoefficients,
} from "../preview/preview-energy.js";
import { handlePreviewWebRtcOffer, getPreviewWebRtcConfig } from "../preview/preview-webrtc.js";
import {
  mergeDeviceMetricsSnapshot,
  previewPipelineSnapshot,
  recordClientDisplayMs,
  setPreviewPipelineProfile,
} from "../preview/preview-pipeline-recorder.js";
import { getStreamFrameAgeMs } from "@openlabos/preview";
import { listPreviewLabReports } from "../preview/lab-artifacts.js";
import { getLabOSFeatureConfig } from "../config/features.js";

export {
  previewHealthSnapshot,
  refreshNativeRecordingStatus,
  startNativeRecording,
  stopNativeRecording,
  warmKitchenProtocolCamera,
};

const router = Router();

type PreviewProxyConfig = {
  path: string;
  timeoutMs?: number;
  headers?: http.OutgoingHttpHeaders;
  closeWithClient?: boolean;
  onResponse: (proxyRes: http.IncomingMessage) => void;
  onError?: (error: Error) => void;
  onTimeout?: (proxyReq: http.ClientRequest) => void;
};

function respondPreviewProxyError(res: Response, error: Error) {
  if (!res.headersSent) {
    res.status(502).json({ error: `Preview server unreachable: ${error.message}` });
  }
}

function respondHealthFallback(res: Response) {
  if (!res.headersSent) {
    resetPreviewHealthEstimator();
    res.json(HEALTH_FALLBACK);
  }
}

function openPreviewProxy(req: Request | null, res: Response, config: PreviewProxyConfig) {
  const proxyReq = http.request(
    {
      hostname: LOCAL_PREVIEW_HOST,
      port: PREVIEW_PORT,
      path: config.path,
      method: "GET",
      ...(config.timeoutMs ? { timeout: config.timeoutMs } : {}),
      ...(config.headers ? { headers: config.headers } : {}),
    },
    config.onResponse,
  );

  proxyReq.on("error", (error) => {
    (config.onError || ((err: Error) => respondPreviewProxyError(res, err)))(error);
  });

  if (config.onTimeout) {
    proxyReq.on("timeout", () => {
      config.onTimeout!(proxyReq);
    });
  }

  if (req && config.closeWithClient) {
    req.on("close", () => {
      proxyReq.destroy();
    });
  }

  proxyReq.end();
}

function cameraCommandRoute(routePath: string, action: string) {
  router.post(routePath, asyncRoute(async (_req, res) => {
    await sendCameraCommand(action);
    res.json({ success: true });
  }));
}

router.post("/start", asyncRoute(async (_req, res) => {
  const result = await bootPreviewStreamOrThrow();
  const config = getPreviewProtocolConfig();
  const streamUrl =
    config.transport === "h264-annexb-http" ? "/api/preview/stream/avc" : "/api/preview/stream";
  res.json({
    success: true,
    streamUrl,
    profileId: getActivePreviewProfileId(),
    config,
    port: PREVIEW_PORT,
    ...result.health,
    ...result,
  });
}));

cameraCommandRoute("/stop", CAMERA_ACTIONS.STOP_PREVIEW);
cameraCommandRoute("/photo", CAMERA_ACTIONS.TAKE_PHOTO);
cameraCommandRoute("/video", CAMERA_ACTIONS.TOGGLE_VIDEO);

router.post("/recording/start", asyncRoute(async (req, res) => {
  res.json(await startNativeRecording(typeof req.body?.protocolId === "string" ? req.body.protocolId : undefined));
}));

router.post("/recording/stop", asyncRoute(async (req, res) => {
  res.json(await stopNativeRecording(typeof req.body?.reason === "string" ? req.body.reason : undefined));
}));

router.post("/recording/toggle", asyncRoute(async (_req, res) => {
  res.json(await toggleNativeRecording());
}));

router.get("/recording/status", asyncRoute(async (_req, res) => {
  res.json(await refreshNativeRecordingStatus());
}));

router.get("/stream", asyncRoute(async (_req, res) => {
  await ensurePortForward();
  sharedPreviewStreamHub.addClient(res);
}));

router.get("/stream/avc", asyncRoute(async (_req, res) => {
  await ensurePortForward();
  openPreviewProxy(null, res, {
    path: "/stream/avc",
    closeWithClient: true,
    onResponse: (proxyRes) => {
      if ((proxyRes.statusCode || 0) >= 400) {
        res.status(proxyRes.statusCode || 503).json({ error: "H.264 stream unavailable" });
        proxyRes.resume();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "video/h264",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      proxyRes.pipe(res);
    },
  });
}));

router.get("/config", asyncRoute(async (_req, res) => {
  res.json(previewProtocolCatalog());
}));

router.put("/config", asyncRoute(async (req, res) => {
  const config = setPreviewProtocolConfig(req.body || {});
  if (typeof req.body?.profileId === "string") {
    setPreviewPipelineProfile(req.body.profileId);
  }
  let deviceSync: { ok: boolean } | { error: string } = { ok: false };
  try {
    await applyPreviewProtocolToDevice(config);
    deviceSync = { ok: true };
  } catch (error) {
    deviceSync = { error: error instanceof Error ? error.message : String(error) };
  }
  res.json({ ok: true, config, deviceSync });
}));

router.get("/webrtc/config", asyncRoute(async (_req, res) => {
  res.json(getPreviewWebRtcConfig());
}));

router.post("/webrtc/offer", asyncRoute(async (req, res) => {
  const result = handlePreviewWebRtcOffer(req.body || {});
  res.status(result.ok ? 200 : result.error?.includes("not enabled") ? 501 : 400).json(result);
}));

router.post("/adaptive/apply", asyncRoute(async (req, res) => {
  const profileId = (typeof req.body?.profileId === "string"
    ? req.body.profileId
    : getActivePreviewProfileId() || "lowLatency") as import("@openlabos/preview").PreviewProfileId;
  const config = applyPreviewProfile(profileId);
  setPreviewPipelineProfile(profileId);
  await applyPreviewProtocolToDevice(config);
  res.json({ ok: true, profileId, config });
}));

router.get("/energy/estimate", asyncRoute(async (req, res) => {
  const config = getPreviewProtocolConfig();
  const deviceMetrics = await fetchDeviceMetrics();
  const stream = sharedPreviewStreamHub.status();
  const dm = deviceMetrics as {
    fps?: number;
    frameBytes?: number;
    lastTrace?: { frameBytes?: number };
  } | null;
  const ctx = {
    fps: typeof req.query.fps === "string" ? Number(req.query.fps) : dm?.fps ?? config.fps,
    frameBytes:
      typeof req.query.frameBytes === "string"
        ? Number(req.query.frameBytes)
        : dm?.frameBytes ?? dm?.lastTrace?.frameBytes ?? previewFrameBuffer.latest()?.sizeBytes ?? null,
  };
  res.json({
    ...previewEnergySnapshot(ctx),
    streaming: stream.running,
    deviceMetrics: deviceMetrics?.ok === true ? deviceMetrics : null,
  });
}));

router.get("/energy/model", (_req, res) => {
  res.json(previewEnergySnapshot());
});

router.post("/energy/calibrate", asyncRoute(async (req, res) => {
  const measuredMw = Number(req.body?.measuredMw);
  if (!Number.isFinite(measuredMw) || measuredMw <= 0) {
    res.status(400).json({ ok: false, error: "measuredMw required" });
    return;
  }
  const config = getPreviewProtocolConfig();
  recordEnergyCalibrationSample({
    config,
    measuredMw,
    context: {
      fps: typeof req.body?.fps === "number" ? req.body.fps : config.fps,
      frameBytes: typeof req.body?.frameBytes === "number" ? req.body.frameBytes : null,
      thermalCpuC: typeof req.body?.thermalCpuC === "number" ? req.body.thermalCpuC : null,
    },
  });
  res.json(previewEnergySnapshot());
}));

router.post("/energy/coefficients", asyncRoute(async (req, res) => {
  const coeffs = req.body?.coefficients;
  if (!coeffs || typeof coeffs !== "object") {
    res.status(400).json({ ok: false, error: "coefficients object required" });
    return;
  }
  setEnergyModelCoefficients(coeffs);
  res.json(previewEnergySnapshot());
}));

router.get("/trace", asyncRoute(async (_req, res) => {
  const config = getPreviewProtocolConfig();
  const stream = sharedPreviewStreamHub.status();
  const deviceMetrics = await fetchDeviceMetrics();
  await mergeDeviceMetricsSnapshot(deviceMetrics);
  const latestFrame = previewFrameBuffer.latest()?.sizeBytes ?? null;
  const dm = deviceMetrics as { fps?: number; frameBytes?: number; lastTrace?: { frameBytes?: number } } | null;
  const energyCtx = {
    fps: dm?.fps ?? config.fps,
    frameBytes: dm?.frameBytes ?? dm?.lastTrace?.frameBytes ?? latestFrame,
  };
  res.json(
    previewPipelineSnapshot({
      encodeMode: config.encodeMode,
      transport: config.transport,
      width: config.width,
      height: config.height,
      fps: config.fps,
      frameCount: previewFrameBuffer.stats().frameCount,
      streamFrameAgeMs: getStreamFrameAgeMs(),
      streamClients: stream.clients,
      streamReconnects: stream.reconnects,
      deviceMetrics,
      energy: previewEnergySnapshot(energyCtx).breakdown,
    }),
  );
}));

router.post("/client-trace", asyncRoute(async (req, res) => {
  const clientDisplayMs = Number(req.body?.clientDisplayMs);
  const glassToGlassMs = req.body?.glassToGlassMs !== undefined ? Number(req.body.glassToGlassMs) : undefined;
  if (Number.isFinite(clientDisplayMs) && clientDisplayMs >= 0) {
    recordClientDisplayMs(
      Math.round(clientDisplayMs),
      Number.isFinite(glassToGlassMs) ? Math.round(glassToGlassMs!) : undefined,
    );
  }
  res.json({ ok: true });
}));

router.get("/metrics", asyncRoute(async (_req, res) => {
  const config = getPreviewProtocolConfig();
  const stream = sharedPreviewStreamHub.status();
  const deviceMetrics = await fetchDeviceMetrics();
  await mergeDeviceMetricsSnapshot(deviceMetrics);
  const trace = previewPipelineSnapshot({
    encodeMode: config.encodeMode,
    transport: config.transport,
    width: config.width,
    height: config.height,
    fps: config.fps,
    frameCount: previewFrameBuffer.stats().frameCount,
    streamClients: stream.clients,
    streamReconnects: stream.reconnects,
    deviceMetrics,
    energy: previewEnergySnapshot({
      fps: (deviceMetrics as { fps?: number } | null)?.fps ?? config.fps,
      frameBytes:
        (deviceMetrics as { frameBytes?: number; lastTrace?: { frameBytes?: number } } | null)?.frameBytes
        ?? (deviceMetrics as { lastTrace?: { frameBytes?: number } } | null)?.lastTrace?.frameBytes
        ?? previewFrameBuffer.latest()?.sizeBytes
        ?? null,
    }).breakdown,
  });
  res.json({
    streaming: stream.running,
    streamFrameAgeMs: getStreamFrameAgeMs(),
    ...trace,
  });
}));

router.get("/frame", asyncRoute(async (_req, res) => {
  const cached = getRecentStreamJpegIfFresh(4500);
  if (cached) {
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(cached);
    return;
  }

  await ensurePortForward();
  openPreviewProxy(null, res, {
    path: "/frame",
    onResponse: (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        res.status(proxyRes.statusCode || 503).json({ error: "No frame available" });
        proxyRes.resume();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      proxyRes.pipe(res);
    },
  });
}));

router.get("/capabilities", asyncRoute(async (_req, res) => {
  res.json(await fetchCameraCapabilities());
}));

router.post("/manual", asyncRoute(async (req, res) => {
  res.json(await applyManualCameraParams(req.body || {}));
}));

router.get("/health", async (req: Request, res: Response) => {
  try {
    const lite = req.query.lite === "1" || req.query.lite === "true";
    res.json(lite ? await previewHealthSnapshotLite() : await previewHealthSnapshot());
  } catch {
    respondHealthFallback(res);
  }
});

router.get("/buffer", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    buffer: previewFrameBuffer.stats(),
    stream: sharedPreviewStreamHub.status(),
  });
});

router.get("/lab/reports", asyncRoute(async (_req, res) => {
  const { experience } = getLabOSFeatureConfig();
  if (!experience.surfaces.engineeringPerfLab) {
    res.status(404).json({ error: "Preview lab is not enabled for this experience profile." });
    return;
  }
  const reports = await listPreviewLabReports();
  res.json({ ok: true, reports });
}));

export default router;
