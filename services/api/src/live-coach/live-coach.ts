/**
 * Gemini Live (bidirectional audio) — uses `@google/genai` directly.
 * Text/VLM inference elsewhere uses Vercel AI SDK via `src/server/ai/labos-inference.ts`.
 */
import type WebSocket from "ws";
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  MediaResolution,
  Modality,
  StartSensitivity,
} from "@google/genai";
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  getLiveCoachConfig,
  type LiveCoachConfig,
  type LiveCoachMediaResolution,
} from "./config.js";
import { LiveCoachRecordingSession, type LiveCoachRecordingStats } from "./recordings.js";
import { normalizeGeminiLiveVoice } from "./voices.js";
import { createGoogleGenAI } from "../ai/google-genai-client.js";
import {
  findProtocolSwitchCommand,
  formatProtocolContextForVoice,
  protocolContextById,
  type LiveCoachProtocolContext,
} from "./protocol-context.js";
import { readJpegDimensions } from "../lib/jpeg.js";

export { readJpegDimensions } from "../lib/jpeg.js";

export type LiveCoachStatus =
  | { state: "idle"; configured: boolean; model: string; audioRoute: string }
  | { state: "connecting" }
  | { state: "connected"; model: string }
  | { state: "error"; message: string };

type ClientWs = WebSocket;

export interface LiveCoachSpeakerPolicy {
  primarySpeaker: "glasses-wearer";
  mode: "glasses-mic-primary" | "push-to-talk";
  wakePhrases: string[];
  backgroundSpeechPolicy: string;
  diarizationProvider: "none" | "external";
}

const DEFAULT_SPEAKER_POLICY: LiveCoachSpeakerPolicy = {
  primarySpeaker: "glasses-wearer",
  mode: "glasses-mic-primary",
  wakePhrases: ["labos", "hey labos", "okay labos"],
  backgroundSpeechPolicy: "Treat the wearer/glasses microphone as the primary operator. Ignore background voices unless the wearer repeats them, asks you to consider them, or they contain an urgent safety warning.",
  diarizationProvider: "none",
};

export function buildLiveCoachSystemInstruction(activeProtocol?: LiveCoachProtocolContext | null) {
  const lines = [
    "You are LabOS, a friendly hands-free copilot speaking through smart glasses.",
    "Speak with a warm British accent and a light, dry sense of humour; keep banter brief and never let it obscure safety or protocol guidance.",
    "Use the user's live audio and live video frames to hold a natural back-and-forth conversation.",
    "Treat LabOS runtime-context blocks as authoritative for elapsed time, video resolution, video cadence, approximate latency, active protocol, and scientific/procedural context.",
    DEFAULT_SPEAKER_POLICY.backgroundSpeechPolicy,
    "If the user asks to switch, load, start, or use a different protocol, acknowledge the switch and then guide from the new protocol's first or current step.",
    "When the user says hello, asks what to do next, or sounds uncertain, respond directly instead of waiting for a perfect command.",
    "When the user asks what to do next, give the next concrete action from the active protocol context.",
    "Describe only visual details you can actually infer from the live frames; if the view is unclear, say so kindly and ask the user to look at the workspace.",
    "Prefer one or two short sentences. If a step is safety-critical or the user asks for more detail, give enough detail to be useful.",
    "Do not narrate hidden analysis, internal reasoning, API details, or confidence scores.",
    "Do not claim a protocol step is verified unless a provided LabOS adherence/verification context says it passed.",
  ];
  if (activeProtocol) {
    lines.push(formatProtocolContextForVoice(activeProtocol));
  }
  return lines.join(" ");
}

export function buildLiveCoachSpeechConfig(config: LiveCoachConfig) {
  if (!config.voiceName) return undefined;
  return {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: config.voiceName },
    },
  };
}

export function geminiMediaResolution(value: LiveCoachMediaResolution) {
  if (value === "high") return MediaResolution.MEDIA_RESOLUTION_HIGH;
  if (value === "medium") return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
  return MediaResolution.MEDIA_RESOLUTION_LOW;
}

/**
 * LiveCoach — bridges:
 * - browser WS (PCM16 16kHz in, PCM16 24kHz out, transcript events)
 * - Gemini Live API session (STT/TTS)
 *
 * Demo-grade: single active session at a time.
 */
export class LiveCoach {
  private config: LiveCoachConfig;
  private status: LiveCoachStatus;
  private model: string;
  private ai: GoogleGenAI | null = null;
  private session: any | null = null;
  private client: ClientWs | null = null;
  private recording: LiveCoachRecordingSession | null = null;
  private setupReady: Promise<void> | null = null;
  private resolveSetupReady: (() => void) | null = null;
  private starting = false;
  private videoFramesSent = 0;
  private videoBytesSent = 0;
  private lastVideoAt: string | null = null;
  private lastVideoError: string | null = null;
  private firstVideoAtMs: number | null = null;
  private lastVideoWidth: number | null = null;
  private lastVideoHeight: number | null = null;
  private sessionStartedAtMs: number | null = null;
  private lastInputAtMs: number | null = null;
  private lastModelOutputAtMs: number | null = null;
  private lastResponseLatencyMs: number | null = null;
  private activeProtocol: LiveCoachProtocolContext | null = null;
  private speakerPolicy: LiveCoachSpeakerPolicy = { ...DEFAULT_SPEAKER_POLICY };

  constructor(opts?: { model?: string }) {
    this.config = getLiveCoachConfig();
    this.model = opts?.model || this.config.model;
    this.status = {
      state: "idle",
      configured: this.config.configured,
      model: this.model,
      audioRoute: this.config.audioRoute,
    };
  }

  public getStatus(): LiveCoachStatus {
    return this.status;
  }

  public getConfig(): LiveCoachConfig {
    return { ...this.config, model: this.model };
  }

  public getActiveProtocol(): LiveCoachProtocolContext | null {
    return this.activeProtocol ? { ...this.activeProtocol, steps: [...this.activeProtocol.steps] } : null;
  }

  public getSpeakerPolicy(): LiveCoachSpeakerPolicy {
    return {
      ...this.speakerPolicy,
      wakePhrases: [...this.speakerPolicy.wakePhrases],
    };
  }

  public setSpeakerPolicy(policy: Partial<LiveCoachSpeakerPolicy>): LiveCoachSpeakerPolicy {
    this.speakerPolicy = {
      ...this.speakerPolicy,
      ...policy,
      primarySpeaker: "glasses-wearer",
      wakePhrases: Array.isArray(policy.wakePhrases) && policy.wakePhrases.length
        ? policy.wakePhrases.map(String)
        : this.speakerPolicy.wakePhrases,
    };
    return this.getSpeakerPolicy();
  }

  public setActiveProtocol(protocolId: string): LiveCoachProtocolContext {
    const context = protocolContextById(protocolId);
    if (!context) {
      throw new Error(`Unknown protocol: ${protocolId}`);
    }
    this.activeProtocol = context;
    return context;
  }

  public async switchProtocol(protocolId: string, opts: { announce?: boolean; source?: string } = {}): Promise<LiveCoachProtocolContext> {
    const context = this.setActiveProtocol(protocolId);
    await this.recording?.recordEvent("protocol_switch", {
      protocolId: context.id,
      name: context.name,
      announced: opts.announce !== false,
      source: opts.source || "api",
    });
    if (opts.announce !== false) {
      if (!this.session) {
        await this.start();
      }
      if (this.session) {
        await this.waitForSetupReady();
        this.noteInputActivity();
        this.sendClientText(
          `${this.buildRuntimeContextText("protocol_switch")}\n\n` +
          `Protocol switch requested by ${opts.source || "operator"}.\n` +
          `Speak a brief confirmation, then give the first concrete action. Mention that the operator can ask "what do I do next?" at any time.`,
        );
      }
    }
    return context;
  }

  public isActive(): boolean {
    return Boolean(this.session);
  }

  public setVoiceName(voiceName: string | null): LiveCoachConfig {
    const normalized = normalizeGeminiLiveVoice(voiceName) || DEFAULT_GEMINI_LIVE_VOICE;
    if (voiceName && !normalized) {
      throw new Error(`Unsupported Gemini Live voice: ${voiceName}`);
    }
    this.config = {
      ...this.config,
      voiceName: normalized,
    };
    return this.getConfig();
  }

  public getRuntimeContext() {
    const now = Date.now();
    const elapsedSec = this.sessionStartedAtMs ? Math.max(0, (now - this.sessionStartedAtMs) / 1000) : 0;
    const videoSpanSec = this.firstVideoAtMs && this.lastVideoAt
      ? Math.max(0, (Date.parse(this.lastVideoAt) - this.firstVideoAtMs) / 1000)
      : 0;
    return {
      now: new Date(now).toISOString(),
      elapsedSec,
      status: this.status,
      activeProtocol: this.getActiveProtocol(),
      video: {
        framesSent: this.videoFramesSent,
        bytesSent: this.videoBytesSent,
        lastVideoAt: this.lastVideoAt,
        lastError: this.lastVideoError,
        width: this.lastVideoWidth,
        height: this.lastVideoHeight,
        averageFps: videoSpanSec > 0 ? this.videoFramesSent / videoSpanSec : 0,
        mediaResolution: this.config.mediaResolution,
        targetFrameIntervalMs: this.config.videoFrameIntervalMs,
      },
      transport: {
        audioRoute: this.config.audioRoute,
        lastInputAt: this.lastInputAtMs ? new Date(this.lastInputAtMs).toISOString() : null,
        lastModelOutputAt: this.lastModelOutputAtMs ? new Date(this.lastModelOutputAtMs).toISOString() : null,
        approximateResponseLatencyMs: this.lastResponseLatencyMs,
      },
      speaker: this.getSpeakerPolicy(),
    };
  }

  private idleStatus(): LiveCoachStatus {
    return {
      state: "idle",
      configured: this.config.configured,
      model: this.model,
      audioRoute: this.config.audioRoute,
    };
  }

  private buildRuntimeContextText(reason: string) {
    const context = this.getRuntimeContext();
    const elapsed = context.elapsedSec.toFixed(1);
    const videoResolution = context.video.width && context.video.height
      ? `${context.video.width}x${context.video.height}`
      : "unknown";
    const latency = context.transport.approximateResponseLatencyMs == null
      ? "unknown"
      : `${Math.round(context.transport.approximateResponseLatencyMs)} ms`;
    const activeProtocol = context.activeProtocol
      ? formatProtocolContextForVoice(context.activeProtocol)
      : "Active protocol: none selected yet. Ask the operator which protocol to load if a run has not started.";
    return [
      `LabOS runtime-context (${reason}):`,
      `Clock: ${context.now}. Live session elapsed: ${elapsed} seconds.`,
      `Video context: ${context.video.framesSent} frame(s) sent to Gemini Live, last frame resolution ${videoResolution}, average cadence ${context.video.averageFps.toFixed(2)} fps, last frame at ${context.video.lastVideoAt || "never"}.`,
      `Video policy: Gemini media resolution ${context.video.mediaResolution}; target live-video frame interval ${context.video.targetFrameIntervalMs} ms.`,
      `Transport context: audio route ${context.transport.audioRoute}, approximate response latency ${latency}.`,
      `Speaker focus: primary speaker is the glasses wearer; policy is "${context.speaker.backgroundSpeechPolicy}".`,
      activeProtocol,
      "Use these facts as grounding. Do not recite the whole context; answer the operator naturally and only mention metrics when relevant.",
    ].join("\n");
  }

  private noteInputActivity() {
    this.lastInputAtMs = Date.now();
  }

  private noteModelOutput() {
    const now = Date.now();
    this.lastModelOutputAtMs = now;
    if (this.lastInputAtMs) {
      this.lastResponseLatencyMs = Math.max(0, now - this.lastInputAtMs);
    }
  }

  private sendClientText(text: string) {
    this.session?.sendClientContent({
      turns: text,
      turnComplete: true,
    });
  }

  public async bindClient(ws: ClientWs): Promise<void> {
    // Replace any existing client.
    this.client = ws;
    ws.on("close", () => {
      if (this.client === ws) this.client = null;
      // If no client, stop session to avoid orphaned Live connections.
      this.stop().catch(() => {});
    });
  }

  public async start(): Promise<void> {
    if (this.session) {
      await this.waitForSetupReady();
      return;
    }
    if (this.starting) {
      await this.waitForStartAttempt();
      if (this.session) await this.waitForSetupReady();
      return;
    }
    this.starting = true;
    try {
      await this.startSession();
    } finally {
      this.starting = false;
    }
  }

  private async startSession(): Promise<void> {
    if (!this.config.configured) {
      this.status = {
        state: "error",
        message: "Gemini Live is not configured. Set a Gemini API key or configure Vertex ADC.",
      };
      this.safeSend({ type: "status", status: this.status });
      return;
    }
    if (!this.ai) {
      this.ai = createGoogleGenAI(process.env, { apiVersion: this.config.apiVersion });
    }
    this.status = { state: "connecting" };
    await this.startRecording();
    this.createSetupWaiter();
    this.videoFramesSent = 0;
    this.videoBytesSent = 0;
    this.lastVideoAt = null;
    this.lastVideoError = null;
    this.firstVideoAtMs = null;
    this.lastVideoWidth = null;
    this.lastVideoHeight = null;
    this.sessionStartedAtMs = Date.now();
    this.lastInputAtMs = null;
    this.lastModelOutputAtMs = null;
    this.lastResponseLatencyMs = null;

    try {
      // Start a Live session with AUDIO output + server-side transcription.
      const session = await this.ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          mediaResolution: geminiMediaResolution(this.config.mediaResolution),
          temperature: 0.55,
          maxOutputTokens: 160,
          thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
          systemInstruction: buildLiveCoachSystemInstruction(this.activeProtocol),
          speechConfig: buildLiveCoachSpeechConfig(this.config),
          enableAffectiveDialog: true,
          realtimeInputConfig: {
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
              prefixPaddingMs: 200,
              silenceDurationMs: 700,
            },
          },
          inputAudioTranscription: { languageCodes: [this.config.languageCode] },
          outputAudioTranscription: { languageCodes: [this.config.languageCode] },
        } as any,
        callbacks: {
          onopen: () => {
            this.status = { state: "connected", model: this.model };
            void this.recording?.recordEvent("status", this.status);
            this.safeSend({ type: "status", status: this.status });
          },
          onmessage: (message: any) => {
            if (message?.setupComplete) {
              void this.recording?.recordEvent("setup", message.setupComplete);
              this.markSetupReady();
            }
            this.handleLiveMessage(message);
          },
          onerror: (e: any) => {
            const msg = e?.message || "Live session error";
            this.status = { state: "error", message: msg };
            this.markSetupReady();
            void this.recording?.recordEvent("status", this.status);
            this.safeSend({ type: "status", status: this.status });
          },
          onclose: (e: any) => {
            // Session ended.
            this.session = null;
            this.sessionStartedAtMs = null;
            this.markSetupReady();
            if (this.status.state !== "error") this.status = this.idleStatus();
            void this.recording?.recordEvent("status", this.status);
            this.safeSend({ type: "status", status: this.status, reason: e?.reason });
          },
        },
      });

      this.session = session;
      await this.waitForSetupReady();
      const currentStatus = this.status as LiveCoachStatus;
      if (currentStatus.state === "error" || this.session !== session) {
        return;
      }
      this.status = { state: "connected", model: this.model };
      void this.recording?.recordEvent("status", this.status);
      this.safeSend({ type: "status", status: this.status });
    } catch (e: any) {
      this.session = null;
      this.status = { state: "error", message: e?.message || "Failed to start Live session" };
      this.markSetupReady();
      await this.stopRecording("start_error");
      this.safeSend({ type: "status", status: this.status });
    }
  }

  public async stop(opts: { drainMs?: number; maxDrainMs?: number } = {}): Promise<void> {
    if (!this.session) {
      this.status = this.idleStatus();
      this.sessionStartedAtMs = null;
      await this.stopRecording("stop", opts);
      return;
    }
    if (this.recording) {
      await this.waitForRecordingOutputIdle(this.recording, opts);
    }
    try {
      this.session.close?.();
    } catch {}
    this.session = null;
    this.status = this.idleStatus();
    this.sessionStartedAtMs = null;
    await this.stopRecording("stop", opts);
    this.safeSend({ type: "status", status: this.status });
  }

  public async sendPcm16Base64(b64: string): Promise<void> {
    if (!this.session) {
      await this.start();
    }
    if (!this.session) return;
    this.noteInputActivity();
    await this.recording?.recordInputAudioBase64(b64);
    // Live API expects base64 of PCM bytes.
    this.session.sendRealtimeInput({
      audio: {
        data: b64,
        mimeType: "audio/pcm;rate=16000",
      },
    });
  }

  public async sendJpegFrame(frame: Buffer): Promise<boolean> {
    if (!this.session || frame.byteLength === 0) return false;
    await this.waitForSetupReady();
    try {
      const dimensions = readJpegDimensions(frame);
      if (dimensions) {
        this.lastVideoWidth = dimensions.width;
        this.lastVideoHeight = dimensions.height;
      }
      if (!this.firstVideoAtMs) this.firstVideoAtMs = Date.now();
      this.session.sendRealtimeInput({
        video: {
          data: frame.toString("base64"),
          mimeType: "image/jpeg",
        },
      });
      this.videoFramesSent += 1;
      this.videoBytesSent += frame.byteLength;
      this.lastVideoAt = new Date().toISOString();
      this.lastVideoError = null;
      await this.recording?.recordInputVideoFrame(frame.byteLength);
      return true;
    } catch (error: any) {
      this.lastVideoError = error?.message || String(error);
      return false;
    }
  }

  public getVideoStats() {
    const now = this.lastVideoAt ? Date.parse(this.lastVideoAt) : Date.now();
    const videoSpanSec = this.firstVideoAtMs ? Math.max(0, (now - this.firstVideoAtMs) / 1000) : 0;
    return {
      framesSent: this.videoFramesSent,
      bytesSent: this.videoBytesSent,
      lastVideoAt: this.lastVideoAt,
      lastError: this.lastVideoError,
      width: this.lastVideoWidth,
      height: this.lastVideoHeight,
      averageFps: videoSpanSec > 0 ? this.videoFramesSent / videoSpanSec : 0,
      mediaResolution: this.config.mediaResolution,
      targetFrameIntervalMs: this.config.videoFrameIntervalMs,
    };
  }

  public async sendText(text: string): Promise<void> {
    if (!this.session) {
      await this.start();
    }
    if (!this.session) return;
    await this.waitForSetupReady();
    this.noteInputActivity();
    await this.recording?.recordEvent("client_text", { text });
    const switchMatch = findProtocolSwitchCommand(text);
    if (switchMatch) {
      await this.switchProtocol(switchMatch.protocol.id, { announce: true, source: "text" });
      return;
    }
    this.sendClientText(`${this.buildRuntimeContextText("client_text")}\n\n${text}`);
  }

  public async markScenario(title: string, scenarioId: string): Promise<void> {
    if (!this.recording && this.config.recordingsEnabled) {
      await this.startRecording(title, scenarioId);
    }
    await this.recording?.updateScenario(title, scenarioId);
  }

  public getActiveRecordingId(): string | null {
    return this.recording?.id || null;
  }

  public activeRecordingHasOutputAudio(): boolean {
    return this.recording?.hasOutputAudio() || false;
  }

  public getActiveRecordingStats(): LiveCoachRecordingStats | null {
    return this.recording?.getStats() || null;
  }

  public async finalizeActiveRecording(
    recordingId: string,
    opts: {
      stableAudioMs?: number;
      minOutputSeconds?: number;
      maxWaitMs?: number;
    } = {},
  ) {
    const stableAudioMs = Math.max(250, opts.stableAudioMs ?? 1800);
    const minOutputSeconds = Math.max(0, opts.minOutputSeconds ?? 0.75);
    const maxWaitMs = Math.max(stableAudioMs, opts.maxWaitMs ?? 20_000);
    const startedAt = Date.now();
    let reason = "timeout";

    for (;;) {
      const recording = this.recording;
      if (!recording || recording.id !== recordingId) {
        reason = "recording_not_active";
        break;
      }
      const stats = recording.getStats();
      const lastOutputAt = stats.lastOutputAudioAt ? Date.parse(stats.lastOutputAudioAt) : 0;
      const outputIdleMs = lastOutputAt ? Date.now() - lastOutputAt : 0;
      const enoughAudio = stats.outputDurationSec >= minOutputSeconds;
      const turnComplete = !!stats.lastTurnCompleteAt;
      if (enoughAudio && outputIdleMs >= stableAudioMs && (turnComplete || Date.now() - startedAt >= stableAudioMs * 2)) {
        reason = turnComplete ? "turn_complete_and_audio_idle" : "audio_idle_without_turn_complete";
        break;
      }
      if (Date.now() - startedAt >= maxWaitMs) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const statsBeforeStop = this.recording?.id === recordingId ? this.recording.getStats() : null;
    await this.stop({ drainMs: stableAudioMs, maxDrainMs: Math.min(5000, maxWaitMs) });
    return {
      recordingId,
      reason,
      complete: reason === "turn_complete_and_audio_idle" || reason === "audio_idle_without_turn_complete",
      stats: statsBeforeStop,
    };
  }

  private async startRecording(title?: string, scenarioId?: string) {
    if (!this.config.recordingsEnabled || this.recording) return;
    this.recording = await LiveCoachRecordingSession.create(this.getConfig(), title, scenarioId);
  }

  private async stopRecording(reason: string, opts: { drainMs?: number; maxDrainMs?: number } = {}) {
    const current = this.recording;
    if (!current) return;
    await this.waitForRecordingOutputIdle(current, opts);
    this.recording = null;
    await current.close(reason).catch(() => {});
  }

  private async waitForRecordingOutputIdle(
    recording: LiveCoachRecordingSession,
    opts: { drainMs?: number; maxDrainMs?: number },
  ) {
    const drainMs = Math.max(0, opts.drainMs ?? 0);
    const maxDrainMs = Math.max(drainMs, opts.maxDrainMs ?? drainMs);
    if (!drainMs || !recording.hasOutputAudio()) return;
    const startedAt = Date.now();
    for (;;) {
      const stats = recording.getStats();
      const lastOutputAt = stats.lastOutputAudioAt ? Date.parse(stats.lastOutputAudioAt) : 0;
      const idleMs = lastOutputAt ? Date.now() - lastOutputAt : 0;
      if (idleMs >= drainMs || Date.now() - startedAt >= maxDrainMs) return;
      await new Promise((resolve) => setTimeout(resolve, Math.min(250, drainMs - idleMs)));
    }
  }

  private createSetupWaiter() {
    this.setupReady = new Promise((resolve) => {
      this.resolveSetupReady = resolve;
      const timer = setTimeout(resolve, 3000);
      if (typeof timer === "object" && "unref" in timer) timer.unref();
    });
  }

  private markSetupReady() {
    this.resolveSetupReady?.();
    this.resolveSetupReady = null;
  }

  private async waitForSetupReady() {
    await this.setupReady;
  }

  private async waitForStartAttempt() {
    while (this.starting && !this.session) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private handleLiveMessage(message: any) {
    // The SDK surfaces server messages; we forward audio + transcript when present.
    const serverContent = message?.serverContent;
    if (serverContent?.interrupted) {
      void this.recording?.recordEvent("interrupt", { reason: "user_activity" });
      this.safeSend({ type: "clear-audio", reason: "interrupted" });
    }
    if (serverContent?.turnComplete || serverContent?.generationComplete) {
      void this.recording?.markTurnComplete({
        turnComplete: !!serverContent?.turnComplete,
        generationComplete: !!serverContent?.generationComplete,
      });
    }
    const modelTurn = serverContent?.modelTurn;
    const parts = modelTurn?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        this.noteModelOutput();
        void this.recording?.recordOutputAudioBase64(part.inlineData.data, part.inlineData.mimeType);
        this.safeSend({ type: "audio", data: part.inlineData.data, mimeType: part.inlineData.mimeType });
      }
      if (part?.text && !part?.thought) {
        this.noteModelOutput();
        void this.recording?.recordEvent("model_text", { text: part.text });
        // Some SDKs provide text directly on part.
        this.safeSend({ type: "text", text: part.text });
      }
    }

    const inputTranscript = serverContent?.inputTranscription?.text;
    if (typeof inputTranscript === "string" && inputTranscript.trim()) {
      const transcript = inputTranscript.trim();
      void this.recording?.recordEvent("transcript", { transcript, source: "input" });
      this.safeSend({ type: "transcript", transcript });
      void this.handleUserTranscript(transcript);
    }

    const outputTranscripts = [
      serverContent?.outputTranscription?.text,
      serverContent?.transcript,
      message?.transcript,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    for (const transcript of outputTranscripts) {
      this.noteModelOutput();
      void this.recording?.recordEvent("transcript", { transcript, source: "output" });
      this.safeSend({ type: "transcript", transcript });
    }
  }

  private async handleUserTranscript(transcript: string) {
    const switchMatch = findProtocolSwitchCommand(transcript);
    if (switchMatch && switchMatch.protocol.id !== this.activeProtocol?.id) {
      await this.switchProtocol(switchMatch.protocol.id, { announce: true, source: "voice" });
      return;
    }
    const asksForRuntimeContext = /\b(how long|elapsed|time passed|latency|delay|resolution|fps|frame rate|scientific context|what protocol|which protocol)\b/i.test(transcript);
    if (asksForRuntimeContext && this.session) {
      this.sendClientText(
        `${this.buildRuntimeContextText("operator_question")}\n\n` +
        `The operator asked: "${transcript}". Answer conversationally and mention only the relevant metric or protocol fact.`,
      );
    }
  }

  private safeSend(obj: any) {
    try {
      if (this.client && this.client.readyState === this.client.OPEN) {
        this.client.send(JSON.stringify(obj));
      }
    } catch {}
  }
}
