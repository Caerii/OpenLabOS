import crypto from "crypto";
import fs from "fs";
import path from "path";
import { adb, setTargetDevice } from "../adb.js";
import { getProtocol } from "../ai/kitchen/protocols.js";
import { getGlassesUrl, isWifiMode } from "../wifi-proxy.js";

export interface ProtocolVoiceScenario {
  id: string;
  title: string;
  category: string;
  protocolId: string;
  stepNumber?: number | null;
  trigger: string;
  script?: string;
  recordingId?: string;
  outputUrl?: string;
}

export interface ProtocolVoiceRecording {
  id: string;
  scenarioId?: string;
  protocolId?: string;
  stepNumber?: number | null;
  outputWav?: string;
  outputUrl?: string;
  staticBaseUrl?: string;
}

export interface ProtocolVoiceManifest {
  protocolId?: string;
  protocolName?: string;
  scenarios?: ProtocolVoiceScenario[];
  recordings?: ProtocolVoiceRecording[];
}

export interface ProtocolStepAudioClip {
  protocolId: string;
  stepNumber: number;
  scenarioId: string;
  recordingId: string;
  localPath: string;
  outputUrl: string;
  devicePath: string;
  bytes: number;
}

const PUBLIC_ROOT = path.resolve(process.env.OPENLABOS_PUBLIC_DIR || path.join(process.cwd(), "public"));
const VOICE_ROOT = path.resolve(PUBLIC_ROOT, "demo", "protocol-voice-assets");
const DEVICE_AUDIO_ROOT = "/sdcard/LabOS/protocol-audio";
const pushedClips = new Map<string, Promise<void>>();

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 2 && !["the", "and", "with", "for", "into", "your"].includes(token));
}

function scenarioMatchesInstruction(scenario: ProtocolVoiceScenario, instruction: string) {
  const normalizedInstruction = normalize(instruction);
  if (!normalizedInstruction) return true;
  const searchable = normalize([
    scenario.title || "",
    scenario.script || "",
    scenario.id || "",
    scenario.outputUrl || "",
  ].join(" "));
  if (searchable.includes(normalizedInstruction)) return true;

  const instructionTokens = meaningfulTokens(instruction);
  if (instructionTokens.length < 3) return false;
  const searchableTokens = new Set(meaningfulTokens(searchable));
  const matchedTokens = instructionTokens.filter((token) => searchableTokens.has(token)).length;
  return matchedTokens / instructionTokens.length >= 0.6;
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "clip";
}

function assertInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved audio path escaped the protocol voice directory");
  }
}

function manifestPathFor(protocolId: string) {
  const safeProtocolId = safePathSegment(protocolId);
  const manifestPath = path.resolve(VOICE_ROOT, safeProtocolId, "manifest.json");
  assertInside(VOICE_ROOT, manifestPath);
  return manifestPath;
}

function outputUrlForProtocolRecording(recording: ProtocolVoiceRecording) {
  if (recording.outputUrl) return recording.outputUrl;
  if (recording.staticBaseUrl) return `${recording.staticBaseUrl}/output.wav`;
  return "";
}

function localPathForStaticOutputUrl(outputUrl: string) {
  const parsed = new URL(outputUrl, "http://labos.local");
  if (parsed.origin !== "http://labos.local") {
    throw new Error("Only bundled protocol voice clips can be sent to the glasses");
  }
  if (!parsed.pathname.startsWith("/demo/protocol-voice-assets/")) {
    throw new Error("Protocol voice clip must live under /demo/protocol-voice-assets");
  }
  const decodedPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const localPath = path.resolve(PUBLIC_ROOT, decodedPath);
  assertInside(VOICE_ROOT, localPath);
  return localPath;
}

function devicePathForClip(protocolId: string, stepNumber: number, localPath: string) {
  const stat = fs.statSync(localPath);
  const hash = crypto
    .createHash("sha256")
    .update(`${localPath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 12);
  const basename = `${String(stepNumber).padStart(2, "0")}-${hash}.wav`;
  return `${DEVICE_AUDIO_ROOT}/${safePathSegment(protocolId)}/${basename}`;
}

export function readProtocolVoiceManifest(protocolId: string): ProtocolVoiceManifest {
  const manifestPath = manifestPathFor(protocolId);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No protocol voice manifest found for ${protocolId}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

export function resolveProtocolStepAudioClip(
  protocolId: string,
  stepNumber: number,
  instruction?: string,
): ProtocolStepAudioClip {
  if (!Number.isFinite(stepNumber) || stepNumber <= 0) {
    throw new Error("stepNumber must be a positive number");
  }

  const protocol = getProtocol(protocolId);
  const protocolStep = protocol?.steps.find((step) => step.number === stepNumber);
  const expectedInstruction = instruction || protocolStep?.instruction || "";
  const manifest = readProtocolVoiceManifest(protocolId);
  const scenarios = manifest.scenarios || [];
  const recordings = manifest.recordings || [];
  const matchingScenarios = scenarios.filter((item) => (
    item.trigger === "step_started" &&
    item.stepNumber === stepNumber &&
    scenarioMatchesInstruction(item, expectedInstruction)
  ));

  const scenario = matchingScenarios[0];
  if (!scenario) {
    throw new Error(`No step narration clip matched ${protocolId} step ${stepNumber}`);
  }

  const recording = recordings.find((item) => (
    item.scenarioId === scenario.id ||
    item.id === scenario.recordingId ||
    item.id === scenario.id
  ));
  if (!recording) {
    throw new Error(`No generated recording found for ${scenario.id}`);
  }

  const outputUrl = outputUrlForProtocolRecording(recording);
  if (!outputUrl) {
    throw new Error(`Generated recording ${recording.id} has no output URL`);
  }

  const localPath = localPathForStaticOutputUrl(outputUrl);
  if (!fs.existsSync(localPath)) {
    throw new Error(`Protocol voice file is missing: ${outputUrl}`);
  }
  const stat = fs.statSync(localPath);
  if (stat.size <= 44) {
    throw new Error(`Protocol voice file is empty: ${outputUrl}`);
  }

  return {
    protocolId,
    stepNumber,
    scenarioId: scenario.id,
    recordingId: recording.id,
    localPath,
    outputUrl,
    devicePath: devicePathForClip(protocolId, stepNumber, localPath),
    bytes: stat.size,
  };
}

async function ensureAdbTargetForAudioPush() {
  if (!isWifiMode()) return;
  const hostname = new URL(getGlassesUrl()).hostname;
  const serial = `${hostname}:5555`;
  await adb(["connect", serial], 10_000).catch(() => "");
  setTargetDevice(serial);
}

export async function ensureProtocolStepAudioOnDevice(clip: ProtocolStepAudioClip) {
  const cacheKey = `${clip.localPath}:${clip.bytes}:${clip.devicePath}`;
  if (!pushedClips.has(cacheKey)) {
    pushedClips.set(cacheKey, (async () => {
      await ensureAdbTargetForAudioPush();
      const deviceDir = clip.devicePath.slice(0, clip.devicePath.lastIndexOf("/"));
      await adb(["shell", "mkdir", "-p", deviceDir], 5000);
      await adb(["push", clip.localPath, clip.devicePath], 15000);
    })().catch((error) => {
      pushedClips.delete(cacheKey);
      throw error;
    }));
  }
  await pushedClips.get(cacheKey);
  return clip.devicePath;
}
