import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LiveCoachConfig } from "./config.js";

export type LiveCoachEventType =
  | "session_start"
  | "session_stop"
  | "client_text"
  | "client_audio"
  | "client_video"
  | "model_audio"
  | "model_text"
  | "transcript"
  | "status"
  | "setup"
  | "scenario"
  | "protocol_switch"
  | "runtime_context"
  | "interrupt"
  | "turn_complete";

export interface LiveCoachRecordingSummary {
  id: string;
  startedAt: string;
  endedAt?: string;
  model: string;
  audioRoute: string;
  title?: string;
  scenarioId?: string;
  eventCount: number;
  inputWav?: string;
  outputWav?: string;
  eventsPath: string;
  metadataPath: string;
  inputBytes?: number;
  outputBytes?: number;
  inputDurationSec?: number;
  outputDurationSec?: number;
  videoFrames?: number;
  videoBytes?: number;
  lastVideoAt?: string;
}

export interface LiveCoachRecordingStats {
  inputBytes: number;
  outputBytes: number;
  inputDurationSec: number;
  outputDurationSec: number;
  eventCount: number;
  lastInputAudioAt?: string;
  lastOutputAudioAt?: string;
  lastTurnCompleteAt?: string;
  videoFrames?: number;
  videoBytes?: number;
  lastVideoAt?: string;
}

type RecordingMetadata = LiveCoachRecordingSummary;

function resolveRecordingRoot(config: LiveCoachConfig) {
  return path.resolve(process.cwd(), config.recordingsDir);
}

function wavHeader(byteLength: number, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(byteLength, 40);
  return header;
}

async function writePcmWav(filePath: string, chunks: Buffer[], sampleRate: number) {
  const pcm = Buffer.concat(chunks);
  await fs.writeFile(filePath, Buffer.concat([wavHeader(pcm.byteLength, sampleRate), pcm]));
}

async function appendJsonLine(filePath: string, value: unknown) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

export class LiveCoachRecordingSession {
  public readonly id: string;
  public readonly rootDir: string;
  public readonly eventsPath: string;
  public readonly metadataPath: string;
  public readonly inputWavPath: string;
  public readonly outputWavPath: string;

  private metadata: RecordingMetadata;
  private eventCount = 0;
  private inputChunks: Buffer[] = [];
  private outputChunks: Buffer[] = [];
  private inputBytes = 0;
  private outputBytes = 0;
  private videoFrames = 0;
  private videoBytes = 0;
  private lastInputAudioAt: string | undefined;
  private lastOutputAudioAt: string | undefined;
  private lastTurnCompleteAt: string | undefined;
  private lastVideoAt: string | undefined;

  private constructor(config: LiveCoachConfig, title?: string, scenarioId?: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.id = `${stamp}-${randomUUID().slice(0, 8)}`;
    this.rootDir = path.join(resolveRecordingRoot(config), this.id);
    this.eventsPath = path.join(this.rootDir, "events.jsonl");
    this.metadataPath = path.join(this.rootDir, "metadata.json");
    this.inputWavPath = path.join(this.rootDir, "input.wav");
    this.outputWavPath = path.join(this.rootDir, "output.wav");
    this.metadata = {
      id: this.id,
      startedAt: new Date().toISOString(),
      model: config.model,
      audioRoute: config.audioRoute,
      title,
      scenarioId,
      eventCount: 0,
      eventsPath: "events.jsonl",
      metadataPath: "metadata.json",
    };
  }

  static async create(config: LiveCoachConfig, title?: string, scenarioId?: string) {
    const session = new LiveCoachRecordingSession(config, title, scenarioId);
    await fs.mkdir(session.rootDir, { recursive: true });
    await session.writeMetadata();
    await session.recordEvent("session_start", { title, scenarioId });
    return session;
  }

  async recordEvent(type: LiveCoachEventType, payload?: unknown) {
    this.eventCount += 1;
    this.metadata.eventCount = this.eventCount;
    await appendJsonLine(this.eventsPath, {
      ts: new Date().toISOString(),
      type,
      payload,
    });
  }

  async recordInputAudioBase64(b64: string) {
    const chunk = Buffer.from(b64, "base64");
    this.inputChunks.push(chunk);
    this.inputBytes += chunk.byteLength;
    this.lastInputAudioAt = new Date().toISOString();
    await this.recordEvent("client_audio", { bytes: chunk.byteLength, sampleRate: 16000 });
  }

  async recordOutputAudioBase64(b64: string, mimeType?: string) {
    const chunk = Buffer.from(b64, "base64");
    this.outputChunks.push(chunk);
    this.outputBytes += chunk.byteLength;
    this.lastOutputAudioAt = new Date().toISOString();
    await this.recordEvent("model_audio", { bytes: chunk.byteLength, sampleRate: 24000, mimeType });
  }

  async recordInputVideoFrame(bytes: number, mimeType = "image/jpeg") {
    this.videoFrames += 1;
    this.videoBytes += Math.max(0, bytes);
    this.lastVideoAt = new Date().toISOString();
    await this.recordEvent("client_video", {
      frame: this.videoFrames,
      bytes,
      mimeType,
    });
  }

  hasOutputAudio() {
    return this.outputChunks.length > 0;
  }

  getStats(): LiveCoachRecordingStats {
    return {
      inputBytes: this.inputBytes,
      outputBytes: this.outputBytes,
      inputDurationSec: this.inputBytes / 2 / 16000,
      outputDurationSec: this.outputBytes / 2 / 24000,
      eventCount: this.eventCount,
      lastInputAudioAt: this.lastInputAudioAt,
      lastOutputAudioAt: this.lastOutputAudioAt,
      lastTurnCompleteAt: this.lastTurnCompleteAt,
      videoFrames: this.videoFrames,
      videoBytes: this.videoBytes,
      lastVideoAt: this.lastVideoAt,
    };
  }

  async markTurnComplete(payload?: unknown) {
    this.lastTurnCompleteAt = new Date().toISOString();
    await this.recordEvent("turn_complete", payload);
  }

  async updateScenario(title: string, scenarioId: string) {
    this.metadata.title = title;
    this.metadata.scenarioId = scenarioId;
    await this.recordEvent("scenario", { title, scenarioId });
    await this.writeMetadata();
  }

  async close(reason = "stop") {
    this.metadata.endedAt = new Date().toISOString();
    const stats = this.getStats();
    this.metadata.inputDurationSec = stats.inputDurationSec;
    this.metadata.outputDurationSec = stats.outputDurationSec;
    this.metadata.inputBytes = stats.inputBytes;
    this.metadata.outputBytes = stats.outputBytes;
    this.metadata.videoFrames = stats.videoFrames;
    this.metadata.videoBytes = stats.videoBytes;
    this.metadata.lastVideoAt = stats.lastVideoAt;
    if (this.inputChunks.length > 0) {
      await writePcmWav(this.inputWavPath, this.inputChunks, 16000);
      this.metadata.inputWav = "input.wav";
    }
    if (this.outputChunks.length > 0) {
      await writePcmWav(this.outputWavPath, this.outputChunks, 24000);
      this.metadata.outputWav = "output.wav";
    }
    await this.recordEvent("session_stop", { reason });
    await this.writeMetadata();
  }

  private async writeMetadata() {
    await fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), "utf-8");
  }
}

export async function listLiveCoachRecordings(config: LiveCoachConfig, limit = 20): Promise<LiveCoachRecordingSummary[]> {
  const root = resolveRecordingRoot(config);
  const cappedLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
    const summaries = await Promise.all(dirs.map(async (dir) => {
      const metadataPath = path.join(dir, "metadata.json");
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8")) as LiveCoachRecordingSummary;
        return metadata;
      } catch {
        return null;
      }
    }));
    return summaries
      .filter((summary): summary is LiveCoachRecordingSummary => !!summary)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, cappedLimit);
  } catch {
    return [];
  }
}

export function getLiveCoachRecordingFile(config: LiveCoachConfig, id: string, file: "input.wav" | "output.wav" | "events.jsonl" | "metadata.json") {
  const root = resolveRecordingRoot(config);
  const safeId = path.basename(id);
  if (safeId !== id) return null;
  const filePath = path.join(root, safeId, file);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fsSync.existsSync(filePath)) {
    return null;
  }
  return filePath;
}
