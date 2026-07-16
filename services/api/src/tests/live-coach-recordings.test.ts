import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LiveCoachRecordingSession, getLiveCoachRecordingFile, listLiveCoachRecordings } from "../live-coach/recordings.js";
import type { LiveCoachConfig } from "../live-coach/config.js";

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "labos-live-coach-"));
  const config: LiveCoachConfig = {
    model: "gemini-live-test",
    configured: true,
    authMode: "gemini-api-key",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    apiVersion: "v1alpha",
    audioRoute: "browser",
    languageCode: "en",
    voiceName: null,
    mediaResolution: "low",
    videoFrameIntervalMs: 1000,
    spatialContextEnabled: true,
    spatialContextIntervalMs: 3000,
    recordingsEnabled: true,
    recordingsDir: tempRoot,
  };

  const session = await LiveCoachRecordingSession.create(config, "Hot water edge case", "hot-water-without-mug");
  await session.recordEvent("client_text", { text: "simulate scenario" });
  await session.recordInputAudioBase64(Buffer.from([0, 0, 1, 0]).toString("base64"));
  await session.recordInputVideoFrame(2048);
  await session.recordOutputAudioBase64(Buffer.from([0, 0, 255, 255]).toString("base64"), "audio/pcm;rate=24000");
  const stats = session.getStats();
  assert.equal(stats.inputBytes, 4);
  assert.equal(stats.outputBytes, 4);
  assert.equal(stats.videoFrames, 1);
  assert.equal(stats.videoBytes, 2048);
  assert.ok(stats.lastVideoAt);
  assert.ok(stats.lastOutputAudioAt);
  await session.markTurnComplete({ turnComplete: true });
  assert.ok(session.getStats().lastTurnCompleteAt);
  await session.close("test_complete");

  const summaries = await listLiveCoachRecordings(config);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].title, "Hot water edge case");
  assert.equal(summaries[0].scenarioId, "hot-water-without-mug");
  assert.equal(summaries[0].inputWav, "input.wav");
  assert.equal(summaries[0].outputWav, "output.wav");
  assert.equal(summaries[0].eventsPath, "events.jsonl");
  assert.equal(summaries[0].metadataPath, "metadata.json");
  assert.equal(summaries[0].inputBytes, 4);
  assert.equal(summaries[0].outputBytes, 4);
  assert.equal(summaries[0].videoFrames, 1);
  assert.equal(summaries[0].videoBytes, 2048);
  assert.ok(summaries[0].eventCount >= 6);

  const inputWav = await fs.readFile(path.join(session.rootDir, "input.wav"));
  const outputWav = await fs.readFile(path.join(session.rootDir, "output.wav"));
  assert.equal(inputWav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(outputWav.subarray(0, 4).toString("ascii"), "RIFF");

  assert.equal(getLiveCoachRecordingFile(config, session.id, "metadata.json"), path.join(session.rootDir, "metadata.json"));
  assert.equal(getLiveCoachRecordingFile(config, "../escape", "metadata.json"), null);

  await fs.rm(tempRoot, { recursive: true, force: true });
  console.log("[live-coach-recordings] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
