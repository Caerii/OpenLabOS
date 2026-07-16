import assert from "node:assert/strict";
import {
  DEFAULT_VERTEX_GEMINI_LIVE_API_VERSION,
  DEFAULT_VERTEX_GEMINI_LIVE_MODEL,
  getLiveCoachConfig,
  normalizeMediaResolution,
} from "../live-coach/config.js";
import { buildLiveCoachSpeechConfig, buildLiveCoachSystemInstruction, geminiMediaResolution } from "../live-coach/live-coach.js";
import {
  DEFAULT_GEMINI_TTS_MODEL,
  preferredVoiceSampleUrl,
  publicVoiceSampleUrl,
  voiceSamplePath,
} from "../live-coach/voice-samples.js";
import { GEMINI_LIVE_VOICES, normalizeGeminiLiveVoice } from "../live-coach/voices.js";

function main() {
  const missing = getLiveCoachConfig({});
  assert.equal(missing.configured, false);
  assert.equal(missing.authMode, "unconfigured");
  assert.equal(missing.model, "gemini-2.5-flash-native-audio-latest");
  assert.equal(missing.apiVersion, "v1alpha");
  assert.equal(missing.audioRoute, "browser");
  assert.equal(missing.languageCode, "en");
  assert.equal(missing.voiceName, "Despina");
  assert.equal(missing.mediaResolution, "low");
  assert.equal(missing.videoFrameIntervalMs, 1000);
  assert.equal(missing.spatialContextEnabled, true);
  assert.equal(missing.spatialContextIntervalMs, 3000);
  assert.equal(missing.recordingsEnabled, true);
  assert.equal(missing.recordingsDir, "data/live-coach-recordings");

  const configured = getLiveCoachConfig({
    GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    GEMINI_LIVE_MODEL: "gemini-live-test",
    GEMINI_LIVE_API_VERSION: "v1beta",
    GEMINI_LIVE_AUDIO_ROUTE: "glasses-cue",
    GEMINI_LIVE_LANGUAGE_CODE: "en-GB",
    GEMINI_LIVE_VOICE_NAME: "Puck",
    GEMINI_LIVE_MEDIA_RESOLUTION: "high",
    GEMINI_LIVE_VIDEO_FRAME_INTERVAL_MS: "750",
    GEMINI_LIVE_SPATIAL_CONTEXT_ENABLED: "false",
    GEMINI_LIVE_SPATIAL_CONTEXT_INTERVAL_MS: "2500",
    GEMINI_LIVE_RECORDINGS_DIR: "tmp/live-recordings",
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.authMode, "gemini-api-key");
  assert.equal(configured.apiKeyEnv, "GOOGLE_GENERATIVE_AI_API_KEY");
  assert.equal(configured.model, "gemini-live-test");
  assert.equal(configured.apiVersion, "v1beta");
  assert.equal(configured.audioRoute, "glasses-cue");
  assert.equal(configured.languageCode, "en-GB");
  assert.equal(configured.voiceName, "Puck");
  assert.equal(configured.mediaResolution, "high");
  assert.equal(configured.videoFrameIntervalMs, 750);
  assert.equal(configured.spatialContextEnabled, false);
  assert.equal(configured.spatialContextIntervalMs, 2500);
  assert.equal(configured.recordingsDir, "tmp/live-recordings");
  assert.deepEqual(buildLiveCoachSpeechConfig(configured), {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: "Puck" },
    },
  });
  assert.equal(GEMINI_LIVE_VOICES.length, 30);
  assert.equal(normalizeGeminiLiveVoice("puck"), "Puck");
  assert.equal(normalizeGeminiLiveVoice("NotARealVoice"), null);
  assert.equal(DEFAULT_GEMINI_TTS_MODEL, "gemini-2.5-flash-preview-tts");
  assert.match(voiceSamplePath("puck", { GEMINI_LIVE_VOICE_SAMPLES_DIR: "tmp/voice-samples" }) || "", /puck\.wav$/);
  assert.equal(voiceSamplePath("NotARealVoice"), null);
  assert.equal(publicVoiceSampleUrl("Puck"), "/demo/live-coach-voice-samples/puck.wav");
  assert.match(preferredVoiceSampleUrl("Puck") || "", /\/(api|demo)\//);
  assert.equal(normalizeMediaResolution("med"), "medium");
  assert.equal(normalizeMediaResolution("bad-value"), "low");
  assert.equal(String(geminiMediaResolution("medium")), "MEDIA_RESOLUTION_MEDIUM");

  const vertexConfigured = getLiveCoachConfig({
    GOOGLE_GENAI_USE_VERTEXAI: "true",
    GOOGLE_CLOUD_PROJECT: "labos-project",
    GOOGLE_CLOUD_LOCATION: "us-central1",
  });
  assert.equal(vertexConfigured.configured, true);
  assert.equal(vertexConfigured.authMode, "vertex-adc");
  assert.equal(vertexConfigured.model, DEFAULT_VERTEX_GEMINI_LIVE_MODEL);
  assert.equal(vertexConfigured.apiVersion, DEFAULT_VERTEX_GEMINI_LIVE_API_VERSION);
  assert.equal(vertexConfigured.voiceName, "Despina");
  assert.equal(vertexConfigured.project, "labos-project");
  assert.equal(vertexConfigured.location, "us-central1");

  const persona = buildLiveCoachSystemInstruction();
  assert.match(persona, /British accent/i);
  assert.match(persona, /back-and-forth/i);
  assert.match(persona, /humou?r/i);
  assert.match(persona, /Do not claim a protocol step is verified/i);

  const recordingsDisabled = getLiveCoachConfig({
    GEMINI_LIVE_RECORDINGS_ENABLED: "false",
  });
  assert.equal(recordingsDisabled.recordingsEnabled, false);

  const invalidRoute = getLiveCoachConfig({
    GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    GEMINI_LIVE_AUDIO_ROUTE: "device-speaker",
  });
  assert.equal(invalidRoute.audioRoute, "browser");

  console.log("[live-coach-config] all checks passed");
}

main();
