import type { LabOSFeatureFlags } from "../../../config/features.js";
import type { KitchenProtocol } from "../protocols.js";
import type { KitchenRunEventType } from "../run-store.js";
import type { ProtocolRun, ProtocolTracker, RunSummary, StepState } from "../tracker.js";
import type { KitchenRunService } from "./run-service.js";
import {
  cleanupTerminalKitchenRunWithPorts,
  type KitchenTerminalCleanupResult,
} from "./terminal-cleanup.js";

export class KitchenHandsFreeServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface KitchenHandsFreeInventoryPreflight {
  passed: boolean;
  detectedItems: string[];
  missingItems: string[];
  frameRef?: string;
  spatialSummary?: unknown;
  voiceContext: string;
  error?: string;
  latencyMs?: number;
}

export interface KitchenHandsFreeStartOptions {
  protocolId: string;
  glassesIp?: string;
  token?: string;
  wsUrl?: string;
  playback?: boolean;
  requireVoice?: boolean;
  supervisor?: {
    intervalMs?: number;
    maxChecks?: number;
    immediate?: boolean;
  };
  captureInventoryPreflight: (
    protocol: KitchenProtocol,
    run: ProtocolRun,
  ) => Promise<KitchenHandsFreeInventoryPreflight>;
}

export interface KitchenHandsFreeStartResult {
  success: true;
  run: RunSummary | null;
  voice: unknown;
  recording: unknown;
  inventoryPreflight: KitchenHandsFreeInventoryPreflight;
  supervisor: unknown;
}

export type KitchenHandsFreeServicePorts = {
  tracker: ProtocolTracker;
  runService: KitchenRunService;
  getProtocol: (protocolId: string) => KitchenProtocol | null | undefined;
  featureFlags: () => LabOSFeatureFlags;
  enableWifiProxy: (glassesIp: string, token?: string) => Promise<unknown>;
  startGlassesAudioBridge: (opts: { wsUrl: string; playback: boolean }) => Promise<unknown>;
  stopGlassesAudioBridge: () => Promise<unknown>;
  getGlassesAudioBridgeStatus: () => Promise<{ connected?: boolean; running?: boolean; lastError?: string }>;
  startNativeRecording: (protocolId?: string) => Promise<unknown>;
  stopNativeRecording: (reason?: string) => Promise<unknown>;
  refreshNativeRecordingStatus: () => Promise<any>;
  saveKitchenSessionManifest: (runId?: string) => Promise<{ manifestRef?: string }>;
  supervisorDefaults: (protocolId: string) => { intervalMs: number; maxChecks: number };
  startRealtimeSupervisor: (opts: {
    intervalMs?: number;
    maxChecks?: number;
    immediate?: boolean;
    announce?: boolean;
  }) => Promise<unknown>;
  stopRealtimeSupervisor: (reason: string) => unknown;
  recordEvent: (
    type: KitchenRunEventType,
    run: { id?: string; protocolId?: string } | null | undefined,
    payload?: Record<string, unknown>,
    snapshotRun?: ProtocolRun | null,
  ) => void | Promise<void>;
  sendLiveCoachHandsFreeStartContext: (
    run: ProtocolRun,
    protocol: KitchenProtocol,
    currentStep: StepState | null,
    inventoryContext?: string,
  ) => Promise<void> | void;
  liveCoachStop: (opts?: { drainMs?: number; maxDrainMs?: number }) => Promise<unknown>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function protocolOrThrow(ports: KitchenHandsFreeServicePorts, protocolId: string) {
  const protocol = ports.getProtocol(protocolId);
  if (!protocol) throw new KitchenHandsFreeServiceError(`Protocol "${protocolId}" not found`, 404);
  return protocol;
}

function nativeRecordingActive(status: any) {
  return status?.state?.active === true || status?.health?.recording === true;
}

function isAbortableRun(run: ProtocolRun | null | undefined) {
  return run?.status === "running" || run?.status === "setup" || run?.status === "paused";
}

export class KitchenHandsFreeService {
  constructor(private readonly ports: KitchenHandsFreeServicePorts) {}

  async startHandsFreeRun(opts: KitchenHandsFreeStartOptions): Promise<KitchenHandsFreeStartResult> {
    const flags = this.ports.featureFlags();
    if (!flags.handsFreeEnabled) {
      throw new KitchenHandsFreeServiceError(
        "Hands-free protocol runs are disabled. Set LABOS_HANDS_FREE_ENABLED=true to enable them.",
      );
    }
    if (!flags.realtimeSupervisorEnabled) {
      throw new KitchenHandsFreeServiceError(
        "Hands-free protocol runs require LABOS_REALTIME_SUPERVISOR_ENABLED=true.",
      );
    }
    if (!opts.protocolId) {
      throw new KitchenHandsFreeServiceError("protocolId is required");
    }

    const protocol = protocolOrThrow(this.ports, opts.protocolId);
    let run: ProtocolRun | null = null;

    try {
      const voice = await this.startVoiceBridge(opts);
      const recording = await this.ensureRecordingActive(opts.protocolId);

      await this.ports.runService.startSetupRun({
        protocolId: opts.protocolId,
        suppressSetupCoach: true,
      });
      run = this.ports.tracker.getCurrentRun();
      if (!run) throw new KitchenHandsFreeServiceError("Failed to start hands-free run");

      const inventoryPreflight = await opts.captureInventoryPreflight(protocol, run);
      await this.ports.runService.applyWorkspaceCheck({
        run,
        passed: inventoryPreflight.passed,
        missingItems: inventoryPreflight.missingItems,
        detectedItems: inventoryPreflight.detectedItems,
        suppressStepCoach: true,
        eventPayload: {
          source: "hands-free-inventory-preflight",
          passed: inventoryPreflight.passed,
          missingItems: inventoryPreflight.missingItems,
          detectedItems: inventoryPreflight.detectedItems,
          frameRef: inventoryPreflight.frameRef,
          spatialSummary: inventoryPreflight.spatialSummary,
          latencyMs: inventoryPreflight.latencyMs,
          error: inventoryPreflight.error,
        },
      });

      await this.ports.runService.forceStartRun({
        suppressStepCoach: true,
        eventPayload: { handsFree: true },
      });

      run = this.ports.tracker.getCurrentRun();
      const currentStep = this.ports.tracker.getCurrentStep();
      const supervisorDefaults = this.ports.supervisorDefaults(opts.protocolId);
      const supervisor = await this.ports.startRealtimeSupervisor({
        intervalMs: opts.supervisor?.intervalMs ?? supervisorDefaults.intervalMs,
        maxChecks: opts.supervisor?.maxChecks ?? supervisorDefaults.maxChecks,
        immediate: opts.supervisor?.immediate === true,
        announce: false,
      });

      if (run) {
        await this.ports.sendLiveCoachHandsFreeStartContext(
          run,
          protocol,
          currentStep,
          inventoryPreflight.voiceContext,
        );
      }

      return {
        success: true,
        run: this.ports.tracker.summary,
        voice,
        recording,
        inventoryPreflight,
        supervisor,
      };
    } catch (error) {
      this.ports.stopRealtimeSupervisor("hands_free_start_failed");
      await this.ports.stopGlassesAudioBridge().catch(() => {});
      if (isAbortableRun(run)) {
        this.ports.tracker.abortRun("hands-free start failed");
        await this.ports.recordEvent("run_abort", run, { reason: "hands-free start failed" }, this.ports.tracker.getCurrentRun());
      }
      await cleanupTerminalKitchenRunWithPorts(this.ports, {
        runId: run?.id,
        reason: "run_aborted",
        saveManifest: false,
      });
      throw error;
    }
  }

  async stopHandsFreeRun(): Promise<{ success: true; cleanup: KitchenTerminalCleanupResult }> {
    const run = this.ports.tracker.getCurrentRun();
    this.ports.stopRealtimeSupervisor("hands_free_stop");
    if (isAbortableRun(run)) {
      this.ports.tracker.abortRun("hands-free stop");
      await this.ports.recordEvent("run_abort", run, { reason: "hands-free stop" }, this.ports.tracker.getCurrentRun());
    }
    const cleanup = await cleanupTerminalKitchenRunWithPorts(this.ports, {
      runId: run?.id,
      reason: "run_aborted",
    });
    await this.ports.stopGlassesAudioBridge().catch(() => {});
    await this.ports.liveCoachStop({ drainMs: 500, maxDrainMs: 2000 }).catch(() => {});
    return { success: true, cleanup };
  }

  private async startVoiceBridge(opts: KitchenHandsFreeStartOptions) {
    if (opts.glassesIp) {
      await this.ports.enableWifiProxy(opts.glassesIp, opts.token);
    }
    if (!opts.wsUrl) return { required: false, status: null };

    await this.ports.startGlassesAudioBridge({
      wsUrl: opts.wsUrl,
      playback: opts.playback !== false,
    });
    const status = await this.waitForGlassesAudioConnected();
    const required = opts.requireVoice !== false;
    if (required && (!status.connected || !status.running)) {
      throw new KitchenHandsFreeServiceError(
        `Glasses audio bridge did not connect: ${status.lastError || "not connected"}`,
      );
    }
    return { required, status };
  }

  private async waitForGlassesAudioConnected() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const status = await this.ports.getGlassesAudioBridgeStatus();
      if (status.connected && status.running) return status;
      await sleep(350);
    }
    return this.ports.getGlassesAudioBridgeStatus();
  }

  private async ensureRecordingActive(protocolId: string) {
    const start = await this.ports.startNativeRecording(protocolId);
    const status = await this.ports.refreshNativeRecordingStatus();
    if (!nativeRecordingActive(status)) {
      throw new KitchenHandsFreeServiceError(
        "Native recording did not become active; refusing to start hands-free run.",
      );
    }
    return { start, status };
  }
}
