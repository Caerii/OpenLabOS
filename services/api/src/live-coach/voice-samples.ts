import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { GEMINI_LIVE_VOICES, normalizeGeminiLiveVoice } from "./voices.js";
import { createGoogleGenAI, getGoogleGenAIClientConfig } from "../ai/google-genai-client.js";

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_SAMPLE_DIR = "data/live-coach-voice-samples";
export const DEFAULT_PUBLIC_VOICE_SAMPLE_DIR = "public/demo/live-coach-voice-samples";
export const PUBLIC_VOICE_SAMPLE_URL_BASE = "/demo/live-coach-voice-samples";
const SAMPLE_RATE = 24_000;

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

function voiceSampleRoot(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(process.cwd(), env.GEMINI_LIVE_VOICE_SAMPLES_DIR?.trim() || DEFAULT_SAMPLE_DIR);
}

function voiceSampleFile(voiceName: string, env: NodeJS.ProcessEnv = process.env) {
  return path.join(voiceSampleRoot(env), `${voiceName.toLowerCase()}.wav`);
}

export function publicVoiceSamplePath(voiceName: string, cwd = process.cwd()) {
  const normalized = normalizeGeminiLiveVoice(voiceName);
  if (!normalized) return null;
  return path.resolve(cwd, DEFAULT_PUBLIC_VOICE_SAMPLE_DIR, `${normalized.toLowerCase()}.wav`);
}

export function publicVoiceSampleUrl(voiceName: string) {
  const normalized = normalizeGeminiLiveVoice(voiceName);
  if (!normalized) return null;
  return `${PUBLIC_VOICE_SAMPLE_URL_BASE}/${encodeURIComponent(normalized.toLowerCase())}.wav`;
}

export function preferredVoiceSampleUrl(voiceName: string, cwd = process.cwd()) {
  const publicPath = publicVoiceSamplePath(voiceName, cwd);
  const publicUrl = publicVoiceSampleUrl(voiceName);
  if (publicPath && publicUrl && fsSync.existsSync(publicPath)) return publicUrl;
  const normalized = normalizeGeminiLiveVoice(voiceName);
  return normalized ? `/api/live-coach/voices/${encodeURIComponent(normalized)}/sample` : null;
}

function samplePrompt(voiceName: string) {
  const voice = GEMINI_LIVE_VOICES.find((item) => item.name === voiceName);
  const character = voice ? `${voice.character}, ${voice.style.toLowerCase()}` : "friendly smart-glasses copilot";
  return [
    `Say as a ${character} with a warm British delivery:`,
    `"Hello, I am LabOS using the ${voiceName} voice. I will guide you step by step, keep things calm, and gently flag anything odd before the tea gets dramatic."`,
  ].join(" ");
}

export function voiceSamplePath(voiceName: string, env: NodeJS.ProcessEnv = process.env) {
  const normalized = normalizeGeminiLiveVoice(voiceName);
  if (!normalized) return null;
  return voiceSampleFile(normalized, env);
}

export async function getOrCreateVoiceSample(voiceName: string, env: NodeJS.ProcessEnv = process.env) {
  const normalized = normalizeGeminiLiveVoice(voiceName);
  if (!normalized) {
    throw new Error(`Unsupported Gemini Live voice: ${voiceName}`);
  }

  const filePath = voiceSampleFile(normalized, env);
  if (fsSync.existsSync(filePath)) return filePath;

  const auth = getGoogleGenAIClientConfig(env);
  if (!auth.configured) {
    throw new Error(`Gemini voice samples require Google GenAI auth. Missing: ${auth.missing.join(", ")}.`);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const ai = createGoogleGenAI(env);
  const response: any = await ai.models.generateContent({
    model: env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text: samplePrompt(normalized) }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: normalized },
        },
      },
    },
  });

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    throw new Error(`Gemini TTS did not return audio for ${normalized}.`);
  }

  const pcm = Buffer.from(data, "base64");
  await fs.writeFile(filePath, Buffer.concat([wavHeader(pcm.byteLength, SAMPLE_RATE), pcm]));
  return filePath;
}
