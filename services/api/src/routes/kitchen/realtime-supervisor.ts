import { Router } from "express";
import { protocolTracker } from "../../ai/kitchen/index.js";
import { DEFAULT_MULTISCALE_POLICY } from "../../ai/kitchen/multiscale-validation.js";
import { workflowPresetForProtocol } from "../../ai/workflows/index.js";
import { getLiveCoachConfig } from "../../live-coach/config.js";
import { getLabOSFeatureFlags } from "../../config/features.js";
import { backgroundPreviewTap } from "../../preview/background-stream-tap.js";
import { previewFrameBuffer } from "../../preview/rolling-frame-buffer.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { runKitchenAdherenceTick, type KitchenAdherenceTickResult } from "./adherence-runner.js";
import { sendLiveCoachSupervisorStartContext } from "./shared.js";

export interface KitchenRealtimeSupervisorStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  maxChecks: number;
  startedAt: number | null;
  stoppedAt: number | null;
  stopReason?: string;
  inFlight: boolean;
  tickCount: number;
  lastTickAt: number | null;
  lastError: string | null;
  lastResult: Pick<KitchenAdherenceTickResult, "adherence" | "stepAdvanced" | "runCompleted" | "currentStep"> | null;
  runId: string | null;
  stepNumber: number | null;
  liveVideo: {
    running: boolean;
    intervalMs: number;
    framesSent: number;
    lastFrameAt: number | null;
    lastError: string | null;
  };
  buffer: ReturnType<typeof previewFrameBuffer.stats>;
  previewTap: ReturnType<typeof backgroundPreviewTap.status>;
}

class KitchenRealtimeSupervisor {
  private timer: NodeJS.Timeout | null = null;
  private sampleTimer: NodeJS.Timeout | null = null;
  private liveVideoTimer: NodeJS.Timeout | null = null;
  private running = false;
  private intervalMs = workflowPresetForProtocol().supervisor.intervalMs;
  private sampleIntervalMs = workflowPresetForProtocol().supervisor.sampleIntervalMs;
  private liveVideoIntervalMs = 1000;
  private maxChecks = workflowPresetForProtocol().supervisor.maxChecks;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private stopReason: string | undefined;
  private inFlight = false;
  private tickCount = 0;
  private liveVideoFramesSent = 0;
  private lastLiveVideoAt: number | null = null;
  private lastLiveVideoError: string | null = null;
  private lastTickAt: number | null = null;
  private lastError: string | null = null;
  private lastResult: KitchenRealtimeSupervisorStatus["lastResult"] = null;

  status(): KitchenRealtimeSupervisorStatus {
    const run = protocolTracker.getCurrentRun();
    const step = protocolTracker.getCurrentStep();
    const flags = getLabOSFeatureFlags();
    return {
      enabled: flags.realtimeSupervisorEnabled,
      running: this.running,
      intervalMs: this.intervalMs,
      maxChecks: this.maxChecks,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      stopReason: this.stopReason,
      inFlight: this.inFlight,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      lastResult: this.lastResult,
      runId: run?.id ?? null,
      stepNumber: step?.step.number ?? null,
      liveVideo: {
        running: this.running && !!this.liveVideoTimer,
        intervalMs: this.liveVideoIntervalMs,
        framesSent: this.liveVideoFramesSent,
        lastFrameAt: this.lastLiveVideoAt,
        lastError: this.lastLiveVideoError,
      },
      buffer: previewFrameBuffer.stats(),
      previewTap: backgroundPreviewTap.status(),
    };
  }

  async start(opts: { intervalMs?: number; maxChecks?: number; immediate?: boolean; announce?: boolean } = {}) {
    if (!getLabOSFeatureFlags().realtimeSupervisorEnabled) {
      badRequest("Realtime supervisor is disabled. Set LABOS_REALTIME_SUPERVISOR_ENABLED=true to enable it.");
    }
    const run = protocolTracker.getCurrentRun();
    if (!run || run.status !== "running") {
      badRequest("A running workflow protocol is required before starting realtime supervision");
    }

    const supervisorDefaults = workflowPresetForProtocol(run.protocolId).supervisor;
    const liveCoachConfig = getLiveCoachConfig();
    this.intervalMs = Math.max(supervisorDefaults.minIntervalMs, Number(opts.intervalMs) || supervisorDefaults.intervalMs);
    this.sampleIntervalMs = supervisorDefaults.sampleIntervalMs;
    this.liveVideoIntervalMs = liveCoachConfig.videoFrameIntervalMs;
    this.maxChecks = Math.max(1, Math.min(supervisorDefaults.maxChecksLimit, Number(opts.maxChecks) || supervisorDefaults.maxChecks));
    this.running = true;
    this.startedAt = Date.now();
    this.stoppedAt = null;
    this.stopReason = undefined;
    this.lastError = null;
    this.liveVideoFramesSent = 0;
    this.lastLiveVideoAt = null;
    this.lastLiveVideoError = null;
    previewFrameBuffer.clear();
    void getKitchenRouteDeps().warmKitchenProtocolCamera();
    backgroundPreviewTap.start();
    const currentStep = protocolTracker.getCurrentStep();
    if (opts.announce !== false && currentStep) void sendLiveCoachSupervisorStartContext(run, currentStep);

    this.armTimer();
    this.armSampler();
    this.armLiveVideoPump(250);
    if (opts.immediate !== false) void this.tick();
    return this.status();
  }

  stop(reason = "manual_stop") {
    if (this.timer) clearTimeout(this.timer);
    if (this.sampleTimer) clearTimeout(this.sampleTimer);
    if (this.liveVideoTimer) clearTimeout(this.liveVideoTimer);
    this.timer = null;
    this.sampleTimer = null;
    this.liveVideoTimer = null;
    backgroundPreviewTap.stop();
    this.running = false;
    this.stoppedAt = Date.now();
    this.stopReason = reason;
    return this.status();
  }

  private armTimer() {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  private armSampler() {
    if (!this.running) return;
    if (this.sampleTimer) clearTimeout(this.sampleTimer);
    this.sampleTimer = setTimeout(() => {
      void this.sampleFrame();
    }, this.sampleIntervalMs);
    this.sampleTimer.unref?.();
  }

  private armLiveVideoPump(delayMs = this.liveVideoIntervalMs) {
    if (!this.running) return;
    if (this.liveVideoTimer) clearTimeout(this.liveVideoTimer);
    this.liveVideoTimer = setTimeout(() => {
      void this.pumpLiveVideoFrame();
    }, Math.max(100, delayMs));
    this.liveVideoTimer.unref?.();
  }

  private async sampleFrame() {
    if (!this.running) return;
    try {
      await getKitchenRouteDeps().captureFrame();
    } catch {
      // The adherence tick reports capture failures; sampling is best-effort buffer fill.
    } finally {
      this.armSampler();
    }
  }

  private async pumpLiveVideoFrame() {
    if (!this.running) return;
    try {
      const frame = await getKitchenRouteDeps().captureFrame();
      const sent = await getKitchenRouteDeps().liveCoachSendJpegFrame(frame);
      if (sent) {
        this.liveVideoFramesSent += 1;
        this.lastLiveVideoAt = Date.now();
        this.lastLiveVideoError = null;
      }
    } catch (error: any) {
      this.lastLiveVideoError = error?.message || String(error);
    } finally {
      this.armLiveVideoPump();
    }
  }

  private async tick() {
    if (!this.running || this.inFlight) return;
    const run = protocolTracker.getCurrentRun();
    if (!run || run.status !== "running") {
      this.stop(run ? `run_${run.status}` : "no_active_run");
      return;
    }

    this.inFlight = true;
    this.lastTickAt = Date.now();
    try {
      const result = await runKitchenAdherenceTick({
        maxChecks: this.maxChecks,
        useRollingChunk: true,
        videoFps: DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
        chunkWindowMs: DEFAULT_MULTISCALE_POLICY.shortChunkSeconds * 1000,
      });
      this.tickCount += 1;
      this.lastResult = {
        adherence: result.adherence,
        stepAdvanced: result.stepAdvanced,
        runCompleted: result.runCompleted,
        currentStep: result.currentStep,
      };
      this.lastError = null;
      if (result.runCompleted) {
        this.stop("run_completed");
      }
    } catch (error: any) {
      this.lastError = error?.message || String(error);
    } finally {
      this.inFlight = false;
      this.armTimer();
    }
  }
}

export const kitchenRealtimeSupervisor = new KitchenRealtimeSupervisor();

export function registerKitchenRealtimeSupervisorRoutes(router: Router) {
  router.get("/run/supervisor/status", (_req, res) => {
    res.json(kitchenRealtimeSupervisor.status());
  });

  router.post("/run/supervisor/start", asyncRoute(async (req, res) => {
    res.json(await kitchenRealtimeSupervisor.start({
      intervalMs: req.body?.intervalMs,
      maxChecks: req.body?.maxChecks,
      immediate: req.body?.immediate,
    }));
  }));

  router.post("/run/supervisor/stop", (_req, res) => {
    res.json(kitchenRealtimeSupervisor.stop("manual_stop"));
  });
}
