import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { adb, adbShell } from "../adb.js";
import { asyncRoute, badRequest } from "../lib/http.js";
import { playAudioCue, playDeviceAudioFile, type AudioCue } from "../lib/audio-cues.js";
import {
  ensureProtocolStepAudioOnDevice,
  resolveProtocolStepAudioClip,
} from "../lib/protocol-step-audio.js";

const router = Router();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const AUDIO_TEST_BROADCAST = "am broadcast -a com.openlab.labos.ACTION_AUDIO_TEST --es test";
const RESULT_PATH = "/sdcard/LabOS/.audio_test_result.json";
const MIC_RECORDING_PATH = "/sdcard/LabOS/.mic_test.wav";
const PROTOCOL_STEP_AUDIO_DEDUPE_MS = 8_000;
const recentProtocolStepAudio = new Map<string, number>();

async function broadcastAudioTest(test: string, timeoutMs = 10000) {
  await adbShell(`${AUDIO_TEST_BROADCAST} ${test} com.openlab.labos.core`, timeoutMs);
}

async function readAudioTestResult() {
  const json = await adbShell(`cat ${RESULT_PATH}`, 5000);
  return JSON.parse(json.trim());
}

async function runAudioResultTest(test: string, waitMs: number) {
  await broadcastAudioTest(test);
  await sleep(waitMs);
  return readAudioTestResult();
}

async function pullMicRecording() {
  const tmpFile = path.join(os.tmpdir(), `mic-test-${Date.now()}.wav`);
  await adb(["pull", MIC_RECORDING_PATH, tmpFile], 10000);
  return tmpFile;
}

function protocolStepAudioPlaybackKey(body: Record<string, unknown>, clip: ReturnType<typeof resolveProtocolStepAudioClip>) {
  const requested = typeof body.playbackKey === "string" ? body.playbackKey.trim() : "";
  return requested.slice(0, 240) || `${clip.protocolId}:step-${clip.stepNumber}:${clip.recordingId}:${clip.bytes}`;
}

function shouldSkipRecentProtocolStepAudio(key: string, now = Date.now()) {
  for (const [existingKey, playedAt] of recentProtocolStepAudio) {
    if (now - playedAt > PROTOCOL_STEP_AUDIO_DEDUPE_MS * 2) {
      recentProtocolStepAudio.delete(existingKey);
    }
  }
  const previous = recentProtocolStepAudio.get(key);
  if (previous && now - previous < PROTOCOL_STEP_AUDIO_DEDUPE_MS) return true;
  recentProtocolStepAudio.set(key, now);
  return false;
}

/**
 * POST /cue - Play a short audio cue.
 *
 * In WiFi mode: calls the on-device `/api/audio/play` with a small asset.
 * In ADB mode: falls back to the existing `ACTION_AUDIO_TEST` tone.
 */
router.post("/cue", asyncRoute(async (req, res) => {
  const cue = req.body?.cue as AudioCue | undefined;
  if (!cue) badRequest("cue is required");

  res.json(await playAudioCue(cue));
}));

router.post("/protocol-step", asyncRoute(async (req, res) => {
  const protocolId = typeof req.body?.protocolId === "string" ? req.body.protocolId : "";
  const stepNumber = Number(req.body?.stepNumber);
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction : undefined;
  if (!protocolId) badRequest("protocolId is required");
  if (!Number.isFinite(stepNumber) || stepNumber <= 0) badRequest("stepNumber must be a positive number");

  const clip = resolveProtocolStepAudioClip(protocolId, stepNumber, instruction);
  const playbackKey = protocolStepAudioPlaybackKey(req.body || {}, clip);
  const force = req.body?.force === true;
  if (!force && shouldSkipRecentProtocolStepAudio(playbackKey)) {
    res.json({
      success: true,
      mode: "wifi",
      skipped: true,
      reason: "duplicate_recent",
      clip: {
        protocolId: clip.protocolId,
        stepNumber: clip.stepNumber,
        scenarioId: clip.scenarioId,
        recordingId: clip.recordingId,
        outputUrl: clip.outputUrl,
        devicePath: clip.devicePath,
        bytes: clip.bytes,
      },
    });
    return;
  }

  let playback;
  try {
    const devicePath = await ensureProtocolStepAudioOnDevice(clip);
    playback = await playDeviceAudioFile(devicePath);
  } catch (error) {
    recentProtocolStepAudio.delete(playbackKey);
    throw error;
  }
  res.json({
    success: true,
    mode: playback.mode,
    clip: {
      protocolId: clip.protocolId,
      stepNumber: clip.stepNumber,
      scenarioId: clip.scenarioId,
      recordingId: clip.recordingId,
      outputUrl: clip.outputUrl,
      devicePath: clip.devicePath,
      bytes: clip.bytes,
    },
  });
}));

router.post("/test-tone", asyncRoute(async (_req, res) => {
  await broadcastAudioTest("play_tone");
  res.json({ success: true });
}));

router.post("/test-mic", asyncRoute(async (_req, res) => {
  res.json(await runAudioResultTest("test_mic", 4000));
}));

router.post("/test-vad", asyncRoute(async (_req, res) => {
  res.json(await runAudioResultTest("check_vad", 1000));
}));

router.get("/mic-recording", asyncRoute(async (_req, res) => {
  const tmpFile = await pullMicRecording();
  res.sendFile(tmpFile, () => {
    fs.unlink(tmpFile, () => {});
  });
}));

export default router;
