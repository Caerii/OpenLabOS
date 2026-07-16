import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { GEMINI_LIVE_VOICES } from "../live-coach/voices.js";
import {
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_PUBLIC_VOICE_SAMPLE_DIR,
  getOrCreateVoiceSample,
  publicVoiceSamplePath,
  publicVoiceSampleUrl,
} from "../live-coach/voice-samples.js";
import { getGoogleGenAIClientConfig } from "../ai/google-genai-client.js";

type ManifestVoice = {
  name: string;
  style: string;
  character: string;
  file: string;
  url: string;
  bytes: number;
};

type ManifestMissingVoice = {
  name: string;
  style: string;
  character: string;
  url: string;
  reason: string;
};

const targetDir = path.resolve(process.cwd(), DEFAULT_PUBLIC_VOICE_SAMPLE_DIR);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  GEMINI_LIVE_VOICE_SAMPLES_DIR: DEFAULT_PUBLIC_VOICE_SAMPLE_DIR,
};
const delayBetweenGenerationsMs = Number(env.LABOS_VOICE_SAMPLE_DELAY_MS || 24_000);
const allowPartial = env.LABOS_VOICE_SAMPLE_ALLOW_PARTIAL === "true";
const manifestOnly = env.LABOS_VOICE_SAMPLE_MANIFEST_ONLY === "true";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const retry = parsed?.error?.details?.find((detail: any) => detail?.["@type"]?.includes("RetryInfo"))?.retryDelay;
      const seconds = typeof retry === "string" && retry.endsWith("s") ? Number(retry.slice(0, -1)) : NaN;
      if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000 + 1500);
    } catch {
      // Fall back to text parsing below.
    }
  }
  const textMatch = raw.match(/retry in\s+([0-9.]+)s/i);
  if (textMatch) return Math.max(1000, Number(textMatch[1]) * 1000 + 1500);
  return 30_000;
}

function quotaReason(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("Quota exceeded")) {
    return "Gemini TTS quota exceeded for this API key/project.";
  }
  return raw.slice(0, 240);
}

async function createWithRetry(voiceName: string, attempts = 2) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getOrCreateVoiceSample(voiceName, env);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const waitMs = retryDelayMs(error);
        process.stdout.write(`quota/backoff ${Math.round(waitMs / 1000)}s ... `);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function main() {
  const auth = getGoogleGenAIClientConfig(env);
  if (!manifestOnly && !auth.configured) {
    throw new Error(`Google GenAI auth is required to pre-generate Gemini voice samples. Missing: ${auth.missing.join(", ")}.`);
  }

  await fs.mkdir(targetDir, { recursive: true });
  const force = env.LABOS_REGENERATE_VOICE_SAMPLES === "true";
  const voices: ManifestVoice[] = [];
  const missing: ManifestMissingVoice[] = [];

  for (let index = 0; index < GEMINI_LIVE_VOICES.length; index += 1) {
    const voice = GEMINI_LIVE_VOICES[index];
    const filePath = publicVoiceSamplePath(voice.name);
    const url = publicVoiceSampleUrl(voice.name);
    if (!filePath || !url) continue;
    if (force && fsSync.existsSync(filePath)) {
      await fs.rm(filePath, { force: true });
    }

    const existed = fsSync.existsSync(filePath);
    if (!existed && manifestOnly) {
      missing.push({
        name: voice.name,
        style: voice.style,
        character: voice.character,
        url,
        reason: "not generated",
      });
      continue;
    }

    process.stdout.write(`[voice-samples] ${voice.name} ... `);
    let generatedPath: string;
    try {
      generatedPath = await createWithRetry(voice.name);
    } catch (error) {
      const reason = quotaReason(error);
      process.stdout.write(`failed\n`);
      missing.push({
        name: voice.name,
        style: voice.style,
        character: voice.character,
        url,
        reason,
      });
      if (reason.includes("quota exceeded")) {
        for (const remaining of GEMINI_LIVE_VOICES.slice(index + 1)) {
          const remainingUrl = publicVoiceSampleUrl(remaining.name);
          if (!remainingUrl) continue;
          missing.push({
            name: remaining.name,
            style: remaining.style,
            character: remaining.character,
            url: remainingUrl,
            reason,
          });
        }
        break;
      }
      continue;
    }
    const stat = await fs.stat(generatedPath);
    voices.push({
      name: voice.name,
      style: voice.style,
      character: voice.character,
      file: path.relative(process.cwd(), generatedPath).replace(/\\/g, "/"),
      url,
      bytes: stat.size,
    });
    process.stdout.write(`${existed ? "cached " : ""}${Math.round(stat.size / 1024)} KB\n`);
    if (!existed && delayBetweenGenerationsMs > 0) {
      await sleep(delayBetweenGenerationsMs);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    model: env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL,
    count: voices.length,
    missingCount: missing.length,
    voices,
    missing,
  };
  const manifestPath = path.join(targetDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  console.log(`[voice-samples] wrote ${path.relative(process.cwd(), manifestPath)} (${voices.length} voices)`);
  if (missing.length && !allowPartial && !manifestOnly) {
    throw new Error(`Missing ${missing.length} voice sample(s). Set LABOS_VOICE_SAMPLE_ALLOW_PARTIAL=true to keep a partial manifest.`);
  }
}

main().catch((error) => {
  console.error(`[voice-samples] failed: ${error?.message || String(error)}`);
  process.exit(1);
});
