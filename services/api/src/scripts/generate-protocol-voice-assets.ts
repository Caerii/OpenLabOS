import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { getProtocol } from "../ai/kitchen/protocols.js";
import { createGoogleGenAI, getGoogleGenAIClientConfig } from "../ai/google-genai-client.js";
import { generateProtocolVoicePlan, type ProtocolVoiceScenario } from "../live-coach/protocol-voice-assets.js";
import { DEFAULT_GEMINI_TTS_MODEL } from "../live-coach/voice-samples.js";
import { normalizeGeminiLiveVoice } from "../live-coach/voices.js";
import { DEFAULT_GEMINI_LIVE_VOICE } from "../live-coach/config.js";

const SAMPLE_RATE = 24_000;

interface StaticProtocolVoiceRecording {
  id: string;
  title: string;
  scenarioId: string;
  protocolId: string;
  category: string;
  stepNumber: number | null;
  startedAt: string;
  endedAt: string;
  model: string;
  voiceName: string;
  eventCount: number;
  eventsPath: string;
  metadataPath: string;
  staticBaseUrl: string;
  eventsUrl: string;
  outputWav: string;
  outputUrl: string;
  bytes: number;
}

interface MissingProtocolVoiceRecording {
  id: string;
  title: string;
  category: string;
  stepNumber: number | null;
  reason: string;
}

function argValue(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
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

function selectedCategories() {
  const raw = argValue("--categories", process.env.LABOS_PROTOCOL_VOICE_ASSET_CATEGORIES || "welcome,preflight,step_intro,completion");
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function selectedScenarioIds() {
  const raw = argValue("--scenarioIds", process.env.LABOS_PROTOCOL_VOICE_SCENARIO_IDS || "");
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function scenarioIncluded(scenario: ProtocolVoiceScenario, categories: Set<string>, ids: Set<string>) {
  if (ids.size > 0) return ids.has(scenario.id);
  return categories.has(scenario.category);
}

function scenarioPrompt(scenario: ProtocolVoiceScenario) {
  return [
    "Generate a short static voice clip for a smart-glasses protocol demo.",
    "Speak only this final operator-facing cue. Do not add greetings, explanations, stage directions, or markdown.",
    "",
    scenario.script,
  ].join("\n");
}

async function writeScenarioMetadata(root: string, scenario: ProtocolVoiceScenario, model: string, voiceName: string, outputBytes: number) {
  const metadata = {
    id: scenario.id,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    model,
    voiceName,
    title: scenario.title,
    scenarioId: scenario.id,
    eventCount: 4,
    eventsPath: "events.jsonl",
    metadataPath: "metadata.json",
    outputWav: "output.wav",
    outputBytes,
    outputDurationSec: outputBytes / 2 / SAMPLE_RATE,
  };
  const events = [
    { ts: metadata.startedAt, type: "session_start", payload: { title: scenario.title, scenarioId: scenario.id } },
    { ts: metadata.startedAt, type: "scenario", payload: { title: scenario.title, scenarioId: scenario.id } },
    { ts: metadata.endedAt, type: "model_text", payload: { text: scenario.script } },
    { ts: metadata.endedAt, type: "session_stop", payload: { reason: "static_asset_generation" } },
  ];
  await fs.writeFile(path.join(root, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(root, "events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf-8");
}

async function generateScenarioAudio(opts: {
  scenario: ProtocolVoiceScenario;
  root: string;
  model: string;
  voiceName: string;
  force: boolean;
}) {
  const filePath = path.join(opts.root, "output.wav");
  if (!opts.force && fsSync.existsSync(filePath)) {
    return { generated: false, filePath, bytes: fsSync.statSync(filePath).size };
  }

  await fs.mkdir(opts.root, { recursive: true });
  const ai = createGoogleGenAI(process.env);
  const response: any = await ai.models.generateContent({
    model: opts.model,
    contents: [{ role: "user", parts: [{ text: scenarioPrompt(opts.scenario) }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: opts.voiceName },
        },
      },
    },
  });

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    throw new Error(`Gemini TTS did not return audio for ${opts.scenario.id}`);
  }
  const pcm = Buffer.from(data, "base64");
  const wav = Buffer.concat([wavHeader(pcm.byteLength, SAMPLE_RATE), pcm]);
  await fs.writeFile(filePath, wav);
  await writeScenarioMetadata(opts.root, opts.scenario, opts.model, opts.voiceName, pcm.byteLength);
  return { generated: true, filePath, bytes: wav.byteLength };
}

async function main() {
  const protocolId = argValue("--protocolId", "kitchen-tea-v1");
  const protocol = getProtocol(protocolId);
  if (!protocol) throw new Error(`Protocol not found: ${protocolId}`);

  const auth = getGoogleGenAIClientConfig(process.env);
  if (!auth.configured) {
    throw new Error(`Google GenAI auth is required to generate protocol voice assets. Missing: ${auth.missing.join(", ")}.`);
  }

  const voiceName = normalizeGeminiLiveVoice(argValue("--voice", process.env.GEMINI_LIVE_VOICE_NAME || DEFAULT_GEMINI_LIVE_VOICE)) || DEFAULT_GEMINI_LIVE_VOICE;
  const model = argValue("--model", process.env.GEMINI_TTS_MODEL || DEFAULT_GEMINI_TTS_MODEL);
  const force = process.env.LABOS_REGENERATE_PROTOCOL_VOICE_ASSETS === "true" || process.argv.includes("--force");
  const allowPartial = process.env.LABOS_PROTOCOL_VOICE_ALLOW_PARTIAL === "true" || process.argv.includes("--allowPartial");
  const categories = selectedCategories();
  const ids = selectedScenarioIds();
  const targetRoot = path.resolve(process.cwd(), "public/demo/protocol-voice-assets", protocol.id);
  await fs.mkdir(targetRoot, { recursive: true });

  const plan = generateProtocolVoicePlan(protocol);
  const recordings: StaticProtocolVoiceRecording[] = [];
  const missing: MissingProtocolVoiceRecording[] = [];

  for (const scenario of plan.scenarios) {
    if (!scenarioIncluded(scenario, categories, ids)) continue;
    const scenarioRoot = path.join(targetRoot, scenario.id);
    process.stdout.write(`[protocol-voice] ${scenario.id} ... `);
    try {
      const result = await generateScenarioAudio({ scenario, root: scenarioRoot, model, voiceName, force });
      const relRoot = `/demo/protocol-voice-assets/${protocol.id}/${scenario.id}`;
      recordings.push({
        id: scenario.id,
        title: scenario.title,
        scenarioId: scenario.id,
        protocolId: protocol.id,
        category: scenario.category,
        stepNumber: scenario.stepNumber ?? null,
        startedAt: plan.generatedAt,
        endedAt: plan.generatedAt,
        model,
        voiceName,
        eventCount: 4,
        eventsPath: "events.jsonl",
        metadataPath: "metadata.json",
        staticBaseUrl: relRoot,
        eventsUrl: `${relRoot}/events.jsonl`,
        outputWav: "output.wav",
        outputUrl: `${relRoot}/output.wav`,
        bytes: result.bytes,
      });
      process.stdout.write(`${result.generated ? "generated" : "cached"} ${Math.round(result.bytes / 1024)} KB\n`);
    } catch (error: any) {
      missing.push({
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        stepNumber: scenario.stepNumber ?? null,
        reason: error?.message || String(error),
      });
      process.stdout.write("failed\n");
    }
  }

  const scenarios = plan.scenarios.map((scenario) => {
    const recording = recordings.find((item) => item.scenarioId === scenario.id);
    return {
      ...scenario,
      recordingId: recording?.id,
      outputUrl: recording?.outputUrl,
    };
  });
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: "gemini-tts-static-replay",
    protocolId: protocol.id,
    protocolName: protocol.name,
    model,
    voiceName,
    scenarioCount: scenarios.length,
    generatedRecordingCount: recordings.length,
    missingCount: missing.length,
    recordings,
    missing,
    scenarios,
  };
  const manifestPath = path.join(targetRoot, "manifest.json");
  const existingManifest = fsSync.existsSync(manifestPath);
  if (existingManifest && missing.length > 0 && !allowPartial) {
    console.warn(
      `[protocol-voice] preserved existing ${path.relative(process.cwd(), manifestPath)} because generation was incomplete`,
    );
    throw new Error(`Failed to generate ${missing.length} protocol voice clip(s). Use --allowPartial to write a partial manifest.`);
  }
  if (recordings.length === 0 && existingManifest) {
    console.warn(
      `[protocol-voice] no clips were selected or generated; preserved existing ${path.relative(process.cwd(), manifestPath)}`,
    );
    return;
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  console.log(`[protocol-voice] wrote ${path.relative(process.cwd(), manifestPath)} (${recordings.length} clips)`);
  if (missing.length) {
    throw new Error(`Failed to generate ${missing.length} protocol voice clip(s).`);
  }
}

main().catch((error) => {
  console.error(`[protocol-voice] failed: ${error?.message || String(error)}`);
  process.exit(1);
});
