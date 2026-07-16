import { Router, Request, Response } from "express";
import fs from "node:fs";
import { liveCoach } from "../live-coach/singleton.js";
import { getLiveCoachDemoScenario, LIVE_COACH_DEMO_SCENARIOS } from "../live-coach/scenarios.js";
import { getLiveCoachRecordingFile, listLiveCoachRecordings } from "../live-coach/recordings.js";
import { getProtocol } from "../ai/kitchen/protocols.js";
import { generateProtocolVoicePlan, getProtocolVoiceScenario } from "../live-coach/protocol-voice-assets.js";
import { DEFAULT_GEMINI_LIVE_VOICE } from "../live-coach/config.js";
import { isWifiMode } from "../wifi-proxy.js";
import {
  getGlassesAudioBridgeStatus,
  startGlassesAudioBridge,
  stopGlassesAudioBridge,
} from "../live-coach/glasses-audio.js";
import {
  clearWebRtcMetrics,
  getWebRtcExperimentConfig,
  getWebRtcMetrics,
  getWebRtcProvider,
  recordWebRtcMetric,
} from "../live-coach/webrtc.js";
import { GEMINI_LIVE_VOICES, normalizeGeminiLiveVoice } from "../live-coach/voices.js";
import {
  getOrCreateVoiceSample,
  preferredVoiceSampleUrl,
  publicVoiceSamplePath,
} from "../live-coach/voice-samples.js";
import {
  createLiveKitSession,
  getLiveKitSessionConfig,
} from "../live-coach/livekit-session.js";
import { asyncRoute } from "../lib/http.js";

const router = Router();

router.get("/status", (_req: Request, res: Response) => {
  res.json({ status: liveCoach.getStatus(), config: liveCoach.getConfig() });
});

router.get("/health", asyncRoute(async (_req: Request, res: Response) => {
  const config = liveCoach.getConfig();
  const webRtc = getWebRtcExperimentConfig();
  let glassesAudio: any = null;
  if (isWifiMode()) {
    try {
      glassesAudio = await getGlassesAudioBridgeStatus();
    } catch {}
  }
  const effectiveAudioRoute = glassesAudio?.running ? "glasses-native" : config.audioRoute;
  res.json({
    ok: config.configured,
    status: liveCoach.getStatus(),
    configured: config.configured,
    model: config.model,
    audioRoute: config.audioRoute,
    effectiveAudioRoute,
    apiVersion: config.apiVersion,
    languageCode: config.languageCode,
    authMode: config.authMode,
    voiceName: config.voiceName,
    mediaResolution: config.mediaResolution,
    videoFrameIntervalMs: config.videoFrameIntervalMs,
    spatialContextEnabled: config.spatialContextEnabled,
    spatialContextIntervalMs: config.spatialContextIntervalMs,
    apiKeyEnv: config.apiKeyEnv,
    project: config.project,
    location: config.location,
    recordingsEnabled: config.recordingsEnabled,
    recordingsDir: config.recordingsDir,
    activeProtocol: liveCoach.getActiveProtocol(),
    speakerPolicy: liveCoach.getSpeakerPolicy(),
    activeRecordingId: liveCoach.getActiveRecordingId(),
    activeRecordingHasOutputAudio: liveCoach.activeRecordingHasOutputAudio(),
    activeRecordingStats: liveCoach.getActiveRecordingStats(),
    liveVideo: liveCoach.getVideoStats(),
    runtimeContext: liveCoach.getRuntimeContext(),
    webRtc,
    glassesAudio,
    output: effectiveAudioRoute === "glasses-native"
      ? "Gemini Live microphone and model audio are routed through the glasses native audio bridge."
      : config.audioRoute === "browser"
      ? "Gemini Live audio is played by the dashboard browser."
      : "Gemini Live step context is paired with glasses cue sounds; dynamic voice is not routed to glasses speakers yet.",
  });
}));

router.get("/protocol", (_req: Request, res: Response) => {
  res.json({
    activeProtocol: liveCoach.getActiveProtocol(),
    runtimeContext: liveCoach.getRuntimeContext(),
  });
});

router.post("/protocol", asyncRoute(async (req: Request, res: Response) => {
  const protocolId = String(req.body?.protocolId || "");
  if (!protocolId) {
    res.status(400).json({ error: "protocolId is required" });
    return;
  }
  try {
    const activeProtocol = await liveCoach.switchProtocol(protocolId, {
      announce: req.body?.announce !== false,
      source: "api",
    });
    res.json({
      success: true,
      activeProtocol,
      runtimeContext: liveCoach.getRuntimeContext(),
    });
  } catch (error: any) {
    res.status(error?.message?.includes("Unknown protocol") ? 404 : 500).json({
      error: error?.message || String(error),
    });
  }
}));

router.get("/speaker-policy", (_req: Request, res: Response) => {
  res.json({ speakerPolicy: liveCoach.getSpeakerPolicy() });
});

router.post("/speaker-policy", (req: Request, res: Response) => {
  const mode = req.body?.mode === "push-to-talk" ? "push-to-talk" : "glasses-mic-primary";
  const wakePhrases = Array.isArray(req.body?.wakePhrases)
    ? req.body.wakePhrases.map(String).filter(Boolean).slice(0, 8)
    : undefined;
  res.json({
    success: true,
    speakerPolicy: liveCoach.setSpeakerPolicy({
      mode,
      wakePhrases,
      diarizationProvider: req.body?.diarizationProvider === "external" ? "external" : "none",
      backgroundSpeechPolicy: typeof req.body?.backgroundSpeechPolicy === "string" && req.body.backgroundSpeechPolicy.trim()
        ? req.body.backgroundSpeechPolicy.trim()
        : undefined,
    }),
  });
});

router.get("/voices", (_req: Request, res: Response) => {
  const defaultVoiceName = liveCoach.getConfig().voiceName || DEFAULT_GEMINI_LIVE_VOICE;
  const defaultPublicPath = publicVoiceSamplePath(defaultVoiceName);
  const defaultSampleCached = !!defaultPublicPath && fs.existsSync(defaultPublicPath);
  res.json({
    activeVoiceName: liveCoach.getConfig().voiceName,
    voices: [
      {
        name: "default",
        style: "Model default",
        character: `default LabOS voice (${defaultVoiceName})`,
        isDefault: true,
        sampleCached: defaultSampleCached,
        sampleUrl: preferredVoiceSampleUrl(defaultVoiceName),
      },
      ...GEMINI_LIVE_VOICES.map((voice) => {
        const publicPath = publicVoiceSamplePath(voice.name);
        const sampleCached = !!publicPath && fs.existsSync(publicPath);
        return {
          ...voice,
          sampleCached,
          sampleUrl: preferredVoiceSampleUrl(voice.name),
        };
      }),
    ],
  });
});

router.get("/voices/:voiceName/sample", asyncRoute(async (req: Request, res: Response) => {
  const voiceName = normalizeGeminiLiveVoice(req.params.voiceName);
  if (!voiceName) {
    res.status(404).json({ error: "voice not found" });
    return;
  }
  try {
    const publicPath = publicVoiceSamplePath(voiceName);
    if (publicPath) {
      res.type("audio/wav");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
        return;
      }
    }
    const filePath = await getOrCreateVoiceSample(voiceName);
    res.type("audio/wav");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(error?.message?.includes("Google GenAI is not configured") ? 503 : 502).json({
      error: error?.message || String(error),
    });
  }
}));

router.post("/voice", (req: Request, res: Response) => {
  const voiceName = req.body?.voiceName ? String(req.body.voiceName) : null;
  const normalized = normalizeGeminiLiveVoice(voiceName);
  if (voiceName && !normalized) {
    res.status(400).json({
      error: `Unsupported Gemini Live voice: ${voiceName}`,
      voices: GEMINI_LIVE_VOICES,
    });
    return;
  }
  if (liveCoach.isActive()) {
    res.status(409).json({
      error: "Stop the active Gemini Live session before changing voice.",
      activeVoiceName: liveCoach.getConfig().voiceName,
    });
    return;
  }
  const config = liveCoach.setVoiceName(normalized);
  res.json({
    success: true,
    activeVoiceName: config.voiceName,
    config,
  });
});

router.get("/webrtc/config", (_req: Request, res: Response) => {
  res.json(getWebRtcExperimentConfig());
});

router.get("/webrtc/providers", (_req: Request, res: Response) => {
  const config = getWebRtcExperimentConfig();
  res.json({
    activeProvider: config.activeProvider,
    providers: config.providers,
  });
});

router.get("/webrtc/metrics", (_req: Request, res: Response) => {
  res.json(getWebRtcMetrics());
});

router.get("/webrtc/livekit/status", (_req: Request, res: Response) => {
  res.json(getLiveKitSessionConfig());
});

router.post("/webrtc/livekit/session", asyncRoute(async (req: Request, res: Response) => {
  try {
    res.json(await createLiveKitSession({
      roomName: typeof req.body?.roomName === "string" ? req.body.roomName : undefined,
      identity: typeof req.body?.identity === "string" ? req.body.identity : undefined,
      participantName: typeof req.body?.participantName === "string" ? req.body.participantName : undefined,
      protocolId: typeof req.body?.protocolId === "string" ? req.body.protocolId : undefined,
      dispatchAgent: req.body?.dispatchAgent !== false,
      allowDispatchFailure: req.body?.allowDispatchFailure === true,
    }));
  } catch (error: any) {
    const message = error?.message || String(error);
    res.status(message.includes("LiveKit is not configured") ? 503 : 502).json({ error: message });
  }
}));

router.post("/webrtc/metrics", (req: Request, res: Response) => {
  res.json(recordWebRtcMetric(req.body || {}));
});

router.delete("/webrtc/metrics", (_req: Request, res: Response) => {
  res.json(clearWebRtcMetrics());
});

router.post("/webrtc/signal", asyncRoute(async (req: Request, res: Response) => {
  const webRtc = getWebRtcExperimentConfig();
  const provider = getWebRtcProvider(process.env, String(req.body?.providerId || ""));
  if (!webRtc.enabled) {
    res.status(404).json({ error: "Experimental WebRTC is disabled. Set LABOS_EXPERIMENTAL_WEBRTC_ENABLED=true." });
    return;
  }
  if (!provider?.signalingUrl) {
    res.status(501).json({
      error: `Experimental WebRTC provider "${provider?.id || webRtc.activeProvider}" is not configured with a signaling URL.`,
      webRtc,
      provider,
    });
    return;
  }
  const response = await fetch(provider.signalingUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {}),
  });
  const raw = await response.text();
  let payload: any = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }
  if (!response.ok) {
    res.status(response.status).json({
      error: payload?.error || `WebRTC gateway HTTP ${response.status}`,
      payload,
    });
    return;
  }
  res.json(payload);
}));

router.post("/start", async (_req: Request, res: Response) => {
  await liveCoach.start();
  res.json({ success: true, status: liveCoach.getStatus() });
});

router.post("/stop", async (req: Request, res: Response) => {
  const drainMs = Number(req.body?.drainMs || 0);
  const maxDrainMs = Number(req.body?.maxDrainMs || 0);
  await liveCoach.stop({
    drainMs: Number.isFinite(drainMs) ? drainMs : 0,
    maxDrainMs: Number.isFinite(maxDrainMs) ? maxDrainMs : 0,
  });
  res.json({ success: true, status: liveCoach.getStatus() });
});

router.post("/text", async (req: Request, res: Response) => {
  const text = String(req.body?.text || "");
  if (!text) return res.status(400).json({ error: "text is required" });
  await liveCoach.sendText(text);
  res.json({ success: true });
});

router.post("/glasses-audio/start", async (req: Request, res: Response) => {
  const wsUrl = String(req.body?.wsUrl || "");
  if (!wsUrl) {
    res.status(400).json({ error: "wsUrl is required" });
    return;
  }
  try {
    res.json(await startGlassesAudioBridge({ wsUrl, playback: req.body?.playback !== false }));
  } catch (e: any) {
    res.status(502).json({ error: e?.message || String(e) });
  }
});

router.post("/glasses-audio/stop", async (_req: Request, res: Response) => {
  try {
    res.json(await stopGlassesAudioBridge());
  } catch (e: any) {
    res.status(502).json({ error: e?.message || String(e) });
  }
});

router.get("/glasses-audio/status", async (_req: Request, res: Response) => {
  try {
    res.json(await getGlassesAudioBridgeStatus());
  } catch (e: any) {
    res.status(502).json({ error: e?.message || String(e) });
  }
});

router.get("/recordings", async (req: Request, res: Response) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  res.json({
    recordings: await listLiveCoachRecordings(liveCoach.getConfig(), Number.isFinite(limit) ? limit : 20),
  });
});

router.get("/recordings/:id/:file", (req: Request, res: Response) => {
  const file = req.params.file;
  if (!["input.wav", "output.wav", "events.jsonl", "metadata.json"].includes(file)) {
    res.status(400).json({ error: "invalid recording file" });
    return;
  }
  const filePath = getLiveCoachRecordingFile(liveCoach.getConfig(), req.params.id, file as any);
  if (!filePath) {
    res.status(404).json({ error: "recording file not found" });
    return;
  }
  if (file.endsWith(".wav")) res.type("audio/wav");
  res.sendFile(filePath);
});

router.post("/recordings/:id/finalize", async (req: Request, res: Response) => {
  const stableAudioMs = Number(req.body?.stableAudioMs || 1800);
  const minOutputSeconds = Number(req.body?.minOutputSeconds || 0.75);
  const maxWaitMs = Number(req.body?.maxWaitMs || 20_000);
  res.json(await liveCoach.finalizeActiveRecording(req.params.id, {
    stableAudioMs: Number.isFinite(stableAudioMs) ? stableAudioMs : 1800,
    minOutputSeconds: Number.isFinite(minOutputSeconds) ? minOutputSeconds : 0.75,
    maxWaitMs: Number.isFinite(maxWaitMs) ? maxWaitMs : 20_000,
  }));
});

router.get("/scenarios", (req: Request, res: Response) => {
  const protocolId = typeof req.query.protocolId === "string" ? req.query.protocolId : "";
  const protocol = protocolId ? getProtocol(protocolId) : null;
  const generated = protocol ? generateProtocolVoicePlan(protocol).scenarios : [];
  res.json({ scenarios: [...LIVE_COACH_DEMO_SCENARIOS, ...generated] });
});

router.post("/scenarios/:id/run", async (req: Request, res: Response) => {
  const protocolId = typeof req.query.protocolId === "string" ? req.query.protocolId : "";
  const protocol = protocolId ? getProtocol(protocolId) : null;
  const scenario = getLiveCoachDemoScenario(req.params.id)
    ?? (protocol ? getProtocolVoiceScenario(protocol, req.params.id) : undefined);
  if (!scenario) {
    res.status(404).json({ error: "scenario not found" });
    return;
  }
  if (protocol) {
    liveCoach.setActiveProtocol(protocol.id);
  }
  await liveCoach.start();
  const status = liveCoach.getStatus();
  if (status.state === "error") {
    res.status(502).json({ error: status.message, status });
    return;
  }
  await liveCoach.markScenario(scenario.title, scenario.id);
  await liveCoach.sendText(scenario.prompt);
  res.json({
    success: true,
    scenario,
    status: liveCoach.getStatus(),
    recordingId: liveCoach.getActiveRecordingId(),
  });
});

router.get("/protocols/:protocolId/assets/plan", (req: Request, res: Response) => {
  const protocol = getProtocol(req.params.protocolId);
  if (!protocol) {
    res.status(404).json({ error: "protocol not found" });
    return;
  }
  res.json(generateProtocolVoicePlan(protocol));
});

router.post("/protocols/:protocolId/scenarios/:scenarioId/run", async (req: Request, res: Response) => {
  const protocol = getProtocol(req.params.protocolId);
  if (!protocol) {
    res.status(404).json({ error: "protocol not found" });
    return;
  }
  const scenario = getProtocolVoiceScenario(protocol, req.params.scenarioId);
  if (!scenario) {
    res.status(404).json({ error: "scenario not found" });
    return;
  }
  liveCoach.setActiveProtocol(protocol.id);
  await liveCoach.start();
  const status = liveCoach.getStatus();
  if (status.state === "error") {
    res.status(502).json({ error: status.message, status });
    return;
  }
  await liveCoach.markScenario(scenario.title, scenario.id);
  await liveCoach.sendText(scenario.prompt);
  res.json({
    success: true,
    scenario,
    status: liveCoach.getStatus(),
    recordingId: liveCoach.getActiveRecordingId(),
  });
});

export default router;

