import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import kitchenRoutes, { resetKitchenRouteDepsForTests, setKitchenRouteDepsForTests } from "../routes/kitchen.js";
import { FALLBACK_MODEL } from "../ai/kitchen/er-runtime.js";
import { protocolTracker, resetAdherencePolicyState } from "../ai/kitchen/index.js";

type JsonResponse<T> = {
  status: number;
  body: T;
};

async function startKitchenTestServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/kitchen", kitchenRoutes);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve kitchen test server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/api/kitchen`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as T : null as T,
  };
}

async function getJson<T>(baseUrl: string, path: string) {
  return requestJson<T>(baseUrl, path, { method: "GET" });
}

async function postJson<T>(baseUrl: string, path: string, body: unknown) {
  return requestJson<T>(baseUrl, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function resetKitchenTrackerForTests() {
  protocolTracker.abortRun("kitchen route test reset");
  resetAdherencePolicyState();
}

async function main() {
  const previousStepSegmentsEnabled = process.env.LABOS_STEP_SEGMENTS_ENABLED;
  const previousConfirmValidationEnabled = process.env.LABOS_CONFIRM_STEP_VALIDATION_ENABLED;
  const previousSupervisorEnabled = process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
  process.env.LABOS_STEP_SEGMENTS_ENABLED = "true";
  process.env.LABOS_CONFIRM_STEP_VALIDATION_ENABLED = "false";
  process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = "true";

  const runCalls: Array<{ mode: { id: string; outputType: string }; opts: any }> = [];
  const eventCalls: any[] = [];
  const segmentCalls: any[] = [];
  const liveCoachMessages: string[] = [];
  const savedPairs: any[] = [];
  let warmCameraCalls = 0;
  let stopRecordingCalls = 0;
  let manifestSaveCalls = 0;

  setKitchenRouteDepsForTests({
    runERMode: async (mode, opts) => {
      runCalls.push({ mode, opts });

      switch (mode.id) {
        case "workspace-check":
          return { raw: "[]", parsed: [], latencyMs: 7 };
        case "success-check":
          return {
            raw: "{\"success\":true,\"confidence\":0.95,\"reasoning\":\"done\"}",
            parsed: { success: true, confidence: 0.95, reasoning: "done" },
            latencyMs: 7,
          };
        case "teacher-judgment":
          return {
            raw: "{\"objects_seen\":[\"mug\"]}",
            parsed: {
              objects_seen: ["mug"],
              action_detected: "place",
              step_complete: true,
              possible_issue: null,
              confidence: 0.9,
              reason: "step complete",
            },
            latencyMs: 7,
          };
        case "search-grounded":
          return {
            raw: "search result",
            parsed: "search result",
            latencyMs: 7,
            sources: [{ title: "boiling guide" }],
          };
        case "video-analysis":
          return {
            raw: "{\"title\":\"Tea\"}",
            parsed: { title: "Tea" },
            latencyMs: 7,
          };
        case "video-to-protocol":
          return {
            raw: "{\"title\":\"Tea\"}",
            parsed: { title: "Tea" },
            latencyMs: 7,
          };
        default:
          if (mode.outputType === "points") {
            return {
              raw: "[]",
              parsed: [
                { point: [100, 200], label: "item-1" },
                { point: [300, 400], label: "item-2" },
              ],
              latencyMs: 7,
            };
          }
          if (mode.outputType === "boxes") {
            return {
              raw: "[]",
              parsed: [{ box_2d: [1, 2, 3, 4], label: "mug" }],
              latencyMs: 7,
            };
          }
          if (mode.outputType === "trajectory") {
            return {
              raw: "[]",
              parsed: [{ point: [10, 20] }, { point: [30, 40] }],
              latencyMs: 7,
            };
          }
          if (mode.outputType === "json") {
            return {
              raw: "{}",
              parsed: { ok: true },
              latencyMs: 7,
            };
          }
          return {
            raw: "text result",
            parsed: "text result",
            latencyMs: 7,
          };
      }
    },
    appendKitchenEvent: async (event) => {
      eventCalls.push(event);
    },
    appendKitchenStepSegment: async (segment) => {
      segmentCalls.push(segment);
    },
    captureFrame: async () => Buffer.from("fake-confirm-frame"),
    saveKitchenFrame: async (_buffer, opts) => `${opts?.prefix || "frame"}-frame.jpg`,
    saveCurrentRunSnapshot: async () => undefined,
    refreshNativeRecordingStatus: async () => ({
      ok: true,
      state: {
        active: true,
        startedAt: new Date(0).toISOString(),
        stoppedAt: null,
        lastCommand: "start",
        lastMode: "explicit",
        lastOutput: "test",
        activeVideoPath: "/tmp/native-active.mp4",
        lastVideoPath: "",
      },
      health: {
        recording: true,
        activeVideoPath: "/tmp/native-active.mp4",
        lastVideoPath: "",
      },
    } as any),
    warmKitchenProtocolCamera: async () => {
      warmCameraCalls += 1;
    },
    stopNativeRecording: async () => {
      stopRecordingCalls += 1;
      return {
        success: true,
        alreadyStopped: true,
        mode: "explicit",
        state: {
          active: false,
          startedAt: null,
          stoppedAt: null,
          lastCommand: "stop",
          lastMode: "explicit",
          lastOutput: "test",
          activeVideoPath: "",
          lastVideoPath: "",
        },
      };
    },
    saveKitchenSessionManifest: async (runId?: string) => {
      manifestSaveCalls += 1;
      return {
        manifest: { run: { id: runId || "current" } } as any,
        manifestRef: `kitchen/manifests/${runId || "current"}.json`,
      };
    },
    liveCoachSendText: async (text) => {
      liveCoachMessages.push(text);
    },
    saveSupervisionPair: async (_frameBuffer, pair) => {
      const record = {
        ...pair,
        id: `pair-${savedPairs.length + 1}`,
        frameFile: `pair-${savedPairs.length + 1}.jpg`,
      };
      savedPairs.push(record);
      return record;
    },
  });

  resetKitchenTrackerForTests();

  const server = await startKitchenTestServer();

  try {
    const protocols = await getJson<{ protocols: Array<{ id: string }> }>(server.baseUrl, "/protocols");
    assert.equal(protocols.status, 200);
    assert.ok(protocols.body.protocols.some((protocol) => protocol.id === "kitchen-tea-v1"));

    const demoSamples = await getJson<{ configured: boolean; samples: unknown[] }>(server.baseUrl, "/demo/samples");
    assert.equal(demoSamples.status, 200);
    assert.equal(Array.isArray(demoSamples.body.samples), true);

    const validationPlan = await getJson<{
      stepPlans: Array<{ stepNumber: number; checks: Array<{ scale: string; modeId: string }> }>;
    }>(server.baseUrl, "/validation/plan/kitchen-tea-v1?stepNumber=3");
    assert.equal(validationPlan.status, 200);
    assert.equal(validationPlan.body.stepPlans.length, 1);
    assert.equal(validationPlan.body.stepPlans[0].stepNumber, 3);
    assert.ok(validationPlan.body.stepPlans[0].checks.some((check) => check.scale === "short_chunk" && check.modeId === "teacher-judgment"));
    assert.ok(validationPlan.body.stepPlans[0].checks.some((check) => check.modeId === "entity-segmentation"));

    const segmentationStatus = await getJson<{ mode: string; configured: boolean }>(
      server.baseUrl,
      "/analyze/entity-segmentation/status",
    );
    assert.equal(segmentationStatus.status, 200);
    assert.equal(typeof segmentationStatus.body.mode, "string");

    const frameValidation = await postJson<{
      selectedChecks: Array<{ modeId: string }>;
      decision: { stepComplete: boolean; action: string };
    }>(
      server.baseUrl,
      "/validation/step",
      {
        protocolId: "kitchen-tea-v1",
        stepNumber: 1,
        scales: ["frame"],
        maxChecks: 2,
        testImageUrl: "https://example.com/frame.jpg",
      },
    );
    assert.equal(frameValidation.status, 200);
    assert.equal(frameValidation.body.selectedChecks.length, 2);
    assert.equal(frameValidation.body.decision.stepComplete, false);
    assert.equal(frameValidation.body.decision.action, "retry_frame");

    const chunkValidation = await postJson<{
      selectedChecks: Array<{ modeId: string; scale: string }>;
      decision: { stepComplete: boolean; action: string };
    }>(
      server.baseUrl,
      "/validation/step",
      {
        protocolId: "kitchen-tea-v1",
        stepNumber: 3,
        scales: ["short_chunk"],
        videoUrl: "https://youtu.be/abc123",
        videoStartOffsetSec: 8,
        videoEndOffsetSec: 12,
        videoFps: 2,
      },
    );
    assert.equal(chunkValidation.status, 200);
    assert.equal(chunkValidation.body.selectedChecks.length, 1);
    assert.equal(chunkValidation.body.selectedChecks[0].modeId, "teacher-judgment");
    assert.equal(chunkValidation.body.decision.stepComplete, true);

    const nonRunRollingChunk = await postJson<{ error: string }>(
      server.baseUrl,
      "/validation/step",
      {
        protocolId: "kitchen-tea-v1",
        stepNumber: 3,
        scales: ["short_chunk"],
      },
    );
    assert.equal(nonRunRollingChunk.status, 400);
    assert.match(nonRunRollingChunk.body.error, /No executable validation checks/i);

    const analyzeCases: Array<{ path: string; body: Record<string, unknown> }> = [
      { path: "/analyze/spatial", body: { maxItems: 3, testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/objects", body: { objects: ["mug"], testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/boxes", body: { maxObjects: 4, testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/trajectory", body: { from: "mug", to: "tray", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/instrument", body: { instrument: "timer", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/liquid-level", body: { container: "measuring cup", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/count", body: { object: "egg", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/safety", body: { currentActivity: "boiling water", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/hands", body: { testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/entity-segmentation", body: { prompts: ["mug", "kettle"], testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/workspace-clear", body: { needSpaceFor: "tea tray", testImageUrl: "https://example.com/frame.jpg" } },
      { path: "/analyze/success-check", body: { verificationPrompt: "Did the mug get placed on the counter?", testImageUrl: "https://example.com/frame.jpg" } },
      {
        path: "/analyze/before-after",
        body: {
          taskDescription: "Place the mug on the counter",
          beforeImage: Buffer.from("before-frame").toString("base64"),
          afterImage: Buffer.from("after-frame").toString("base64"),
        },
      },
    ];

    for (const testCase of analyzeCases) {
      const response = await postJson<{ mode: string }>(server.baseUrl, testCase.path, testCase.body);
      assert.equal(response.status, 200, `${testCase.path} should succeed`);
      assert.ok(typeof response.body.mode === "string");
    }

    const countResponse = await postJson<{ count: number }>(
      server.baseUrl,
      "/analyze/count",
      { object: "egg", testImageUrl: "https://example.com/frame.jpg" },
    );
    assert.equal(countResponse.status, 200);
    assert.equal(countResponse.body.count, 2);

    const invalidObjects = await postJson<{ error: string }>(server.baseUrl, "/analyze/objects", {});
    assert.equal(invalidObjects.status, 400);
    assert.match(invalidObjects.body.error, /objects array is required/i);

    const invalidBeforeAfter = await postJson<{ error: string }>(
      server.baseUrl,
      "/analyze/before-after",
      { taskDescription: "Place the mug on the counter" },
    );
    assert.equal(invalidBeforeAfter.status, 400);
    assert.match(invalidBeforeAfter.body.error, /before\/after inputs are required/i);

    const searchResponse = await postJson<{ mode: string }>(
      server.baseUrl,
      "/analyze/search",
      { query: "how long to boil tea?" },
    );
    assert.equal(searchResponse.status, 200);
    const searchCall = runCalls.at(-1);
    assert.ok(searchCall);
    assert.equal(searchCall.mode.id, "search-grounded");
    assert.equal(searchCall.opts.useSearch, true);
    assert.equal(searchCall.opts.textOnly, true);
    assert.equal(searchCall.opts.modelId, FALLBACK_MODEL);

    const invalidVideo = await postJson<{ error: string }>(
      server.baseUrl,
      "/analyze/video",
      { videoUrl: "https://example.com/not-youtube" },
    );
    assert.equal(invalidVideo.status, 400);
    assert.match(invalidVideo.body.error, /valid YouTube URL/i);

    const videoResponse = await postJson<{ mode: string; videoUrl: string }>(
      server.baseUrl,
      "/analyze/video",
      { videoUrl: "https://youtu.be/abc123", prompt: "Summarize this recipe." },
    );
    assert.equal(videoResponse.status, 200);
    assert.equal(videoResponse.body.videoUrl, "https://youtu.be/abc123");

    const protocolFromVideo = await postJson<{ saved: boolean }>(
      server.baseUrl,
      "/analyze/video/to-protocol",
      { videoUrl: "https://youtu.be/abc123", protocolId: "video-test" },
    );
    assert.equal(protocolFromVideo.status, 200);
    assert.equal(protocolFromVideo.body.saved, false);

    const startRun = await postJson<{ success: boolean; run: { status: string } }>(
      server.baseUrl,
      "/run/start",
      { protocolId: "kitchen-tea-v1" },
    );
    assert.equal(startRun.status, 200);
    assert.equal(startRun.body.run.status, "setup");
    assert.equal(warmCameraCalls, 0);
    assert.equal(liveCoachMessages.length, 1);
    assert.match(liveCoachMessages[0], /setup briefing/i);
    assert.match(liveCoachMessages[0], /Required setup objects/i);
    assert.match(liveCoachMessages[0], /what do I do next/i);

    const setupStatus = await getJson<{ active: boolean; run: { status: string } }>(server.baseUrl, "/run/status");
    assert.equal(setupStatus.status, 200);
    assert.equal(setupStatus.body.active, false);
    assert.equal(setupStatus.body.run.status, "setup");

    const workspaceCheck = await postJson<{ passed: boolean }>(
      server.baseUrl,
      "/run/workspace-check",
      { testImageUrl: "https://example.com/frame.jpg" },
    );
    assert.equal(workspaceCheck.status, 200);
    assert.equal(workspaceCheck.body.passed, true);
    assert.equal(liveCoachMessages.length, 2);
    assert.match(liveCoachMessages[1], /step context/i);

    const runningStatus = await getJson<{ active: boolean; currentStep: { number: number } }>(server.baseUrl, "/run/status");
    assert.equal(runningStatus.status, 200);
    assert.equal(runningStatus.body.active, true);
    assert.equal(runningStatus.body.currentStep.number, 1);

    const features = await getJson<{
      flags: { stepSegmentsEnabled: boolean; confirmStepValidationEnabled: boolean; asyncStepAnalysisEnabled: boolean; realtimeSupervisorEnabled: boolean };
      effectiveFlags: { confirmStepValidationEnabled: boolean; realtimeSupervisorEnabled: boolean };
      experience: { mode: string };
    }>(
      server.baseUrl,
      "/features",
    );
    assert.equal(features.status, 200);
    assert.equal(features.body.flags.stepSegmentsEnabled, true);
    assert.equal(features.body.flags.confirmStepValidationEnabled, false);
    assert.equal(features.body.flags.asyncStepAnalysisEnabled, false);
    assert.equal(features.body.flags.realtimeSupervisorEnabled, true);
    assert.equal(features.body.effectiveFlags.confirmStepValidationEnabled, false);
    assert.equal(features.body.effectiveFlags.realtimeSupervisorEnabled, false);
    assert.equal(features.body.experience.mode, "operator");

    const confirmStep = await postJson<{
      success: boolean;
      segment: { stepNumber: number; frameRefs: string[]; nativeRecording: { active: boolean; activeVideoPath?: string } };
      validation: null;
      currentStep: { number: number };
    }>(
      server.baseUrl,
      "/run/confirm-step",
      { notes: ["operator pressed confirm"], captureChunk: false },
    );
    assert.equal(confirmStep.status, 200);
    assert.equal(confirmStep.body.success, true);
    assert.equal(confirmStep.body.segment.stepNumber, 1);
    assert.equal(confirmStep.body.segment.frameRefs.length, 1);
    assert.equal(confirmStep.body.segment.nativeRecording.active, true);
    assert.equal(confirmStep.body.segment.nativeRecording.activeVideoPath, "/tmp/native-active.mp4");
    assert.equal(confirmStep.body.validation, null);
    assert.equal(confirmStep.body.currentStep.number, 1);
    assert.equal(segmentCalls.length, 1);
    assert.equal(segmentCalls[0].source, "confirm-step");

    const confirmWithDisabledValidation = await postJson<{ error: string }>(
      server.baseUrl,
      "/run/confirm-step",
      { validate: true, captureFrame: false },
    );
    assert.equal(confirmWithDisabledValidation.status, 400);
    assert.match(confirmWithDisabledValidation.body.error, /validation is disabled/i);

    const supervisorBefore = await getJson<{ running: boolean; buffer: { frameCount: number } }>(
      server.baseUrl,
      "/run/supervisor/status",
    );
    assert.equal(supervisorBefore.status, 200);
    assert.equal(supervisorBefore.body.running, false);

    const supervisorStart = await postJson<{ running: boolean; intervalMs: number; maxChecks: number }>(
      server.baseUrl,
      "/run/supervisor/start",
      { intervalMs: 3000, maxChecks: 2, immediate: false },
    );
    assert.equal(supervisorStart.status, 200);
    assert.equal(supervisorStart.body.running, true);
    assert.equal(supervisorStart.body.intervalMs, 10000);
    assert.equal(supervisorStart.body.maxChecks, 2);

    const supervisorStop = await postJson<{ running: boolean; stopReason: string }>(
      server.baseUrl,
      "/run/supervisor/stop",
      {},
    );
    assert.equal(supervisorStop.status, 200);
    assert.equal(supervisorStop.body.running, false);
    assert.equal(supervisorStop.body.stopReason, "manual_stop");

    process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = "false";
    const disabledSupervisor = await postJson<{ error: string }>(
      server.baseUrl,
      "/run/supervisor/start",
      { intervalMs: 3000, maxChecks: 2, immediate: false },
    );
    assert.equal(disabledSupervisor.status, 400);
    assert.match(disabledSupervisor.body.error, /realtime supervisor is disabled/i);
    process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = "true";

    const frameAdherence = await postJson<{
      stepAdvanced: boolean;
      adherence: { action: string; recommendedNextScale?: string };
      currentStep: { number: number };
    }>(
      server.baseUrl,
      "/run/adherence-tick",
      { scales: ["frame"], maxChecks: 2, testImage: Buffer.from("fake-adherence-frame").toString("base64") },
    );
    assert.equal(frameAdherence.status, 200);
    assert.equal(frameAdherence.body.stepAdvanced, false);
    assert.equal(frameAdherence.body.adherence.action, "collect_more_evidence");
    assert.equal(frameAdherence.body.adherence.recommendedNextScale, "frame");
    assert.equal(frameAdherence.body.currentStep.number, 1);
    assert.equal(liveCoachMessages.length, 4);
    assert.match(liveCoachMessages[2], /realtime supervisor started/i);
    assert.match(liveCoachMessages[2], /what do I do next/i);

    const verifyStep = await postJson<{ stepAdvanced: boolean; currentStep: { number: number } }>(
      server.baseUrl,
      "/run/verify-step",
      { testImage: Buffer.from("fake-verify-frame").toString("base64") },
    );
    assert.equal(verifyStep.status, 200);
    assert.equal(verifyStep.body.stepAdvanced, true);
    assert.equal(verifyStep.body.currentStep.number, 2);
    assert.equal(liveCoachMessages.length, 6);
    assert.match(liveCoachMessages[4], /context update/i);
    assert.match(liveCoachMessages[5], /step context/i);

    const chunkAdherence = await postJson<{
      stepAdvanced: boolean;
      adherence: { action: string };
      currentStep: { number: number };
    }>(
      server.baseUrl,
      "/run/adherence-tick",
      {
        scales: ["short_chunk"],
        videoUrl: "https://youtu.be/abc123",
        videoStartOffsetSec: 8,
        videoEndOffsetSec: 12,
        videoFps: 2,
      },
    );
    assert.equal(chunkAdherence.status, 200);
    assert.equal(chunkAdherence.body.adherence.action, "advance");
    assert.equal(chunkAdherence.body.stepAdvanced, true);
    assert.equal(chunkAdherence.body.currentStep.number, 3);
    assert.equal(liveCoachMessages.length, 8);

    const nextStep = await postJson<{ step: { number: number } }>(
      server.baseUrl,
      "/analyze/next-step",
      { testImageUrl: "https://example.com/frame.jpg" },
    );
    assert.equal(nextStep.status, 200);
    assert.equal(nextStep.body.step.number, 3);

    const manifest = await getJson<{
      schemaVersion: string;
      run: { protocolId: string };
      steps: Array<{ number: number; verifications: unknown[] }>;
      frames: Array<{ frameRef: string }>;
      adherence: unknown[];
    }>(server.baseUrl, "/session/manifest");
    assert.equal(manifest.status, 200);
    assert.equal(manifest.body.schemaVersion, "labos.kitchen.session-manifest.v1");
    assert.equal(manifest.body.run.protocolId, "kitchen-tea-v1");
    assert.ok(manifest.body.steps.some((step) => step.number === 2 && step.verifications.length > 0));
    assert.ok(manifest.body.frames.some((frame) => /verify-step1|adherence-step1/.test(frame.frameRef)));

    const teacherVerify = await postJson<{ verification: { protocolId: string; stepNumber: number } }>(
      server.baseUrl,
      "/teacher/verify-step",
      { protocolId: "kitchen-tea-v1", stepNumber: 1, testImageUrl: "https://example.com/frame.jpg" },
    );
    assert.equal(teacherVerify.status, 200);
    assert.equal(teacherVerify.body.verification.protocolId, "kitchen-tea-v1");
    assert.equal(teacherVerify.body.verification.stepNumber, 1);

    const teacherJudgment = await postJson<{ judgment: { step_id: string; step_complete: boolean } }>(
      server.baseUrl,
      "/teacher/judgment",
      { protocolId: "kitchen-tea-v1", stepNumber: 1, testImageUrl: "https://example.com/frame.jpg" },
    );
    assert.equal(teacherJudgment.status, 200);
    assert.equal(teacherJudgment.body.judgment.step_id, "setup-tea-workspace");
    assert.equal(teacherJudgment.body.judgment.step_complete, true);

    const teacherVideoJudgment = await postJson<{
      judgment: { step_id: string };
      clip: { videoStartOffsetSec: number; videoEndOffsetSec: number; videoFps: number };
    }>(
      server.baseUrl,
      "/teacher/judgment/video",
      {
        protocolId: "kitchen-tea-v1",
        stepNumber: 1,
        videoUrl: "https://youtu.be/abc123",
        videoStartOffsetSec: 8,
        videoEndOffsetSec: 14,
        videoFps: 3,
      },
    );
    assert.equal(teacherVideoJudgment.status, 200);
    assert.equal(teacherVideoJudgment.body.judgment.step_id, "setup-tea-workspace");
    assert.equal(teacherVideoJudgment.body.clip.videoStartOffsetSec, 8);
    assert.equal(teacherVideoJudgment.body.clip.videoEndOffsetSec, 14);
    assert.equal(teacherVideoJudgment.body.clip.videoFps, 3);

    const teacherCompare = await postJson<{
      teacher: { modelId: string; validSchema: boolean };
      student: { modelId: string; validSchema: boolean };
      savedPairId?: string;
    }>(
      server.baseUrl,
      "/teacher/student/compare",
      {
        protocolId: "kitchen-tea-v1",
        stepNumber: 1,
        studentModelId: "runpod:Qwen/Qwen3.5-9B",
        testImage: Buffer.from("fake-jpeg-frame").toString("base64"),
        saveToDataset: true,
        tags: ["tea", "teacher-student"],
      },
    );
    assert.equal(teacherCompare.status, 200);
    assert.equal(teacherCompare.body.teacher.validSchema, true);
    assert.equal(teacherCompare.body.student.modelId, "runpod:Qwen/Qwen3.5-9B");
    assert.equal(teacherCompare.body.student.validSchema, true);
    assert.equal(teacherCompare.body.savedPairId, "pair-1");
    assert.equal(savedPairs.length, 1);

    const abortRun = await postJson<{ success: boolean }>(server.baseUrl, "/run/abort", { reason: "test cleanup" });
    assert.equal(abortRun.status, 200);
    assert.equal(abortRun.body.success, true);

    const idleStatus = await getJson<{ active: boolean; run: { status: string } | null }>(server.baseUrl, "/run/status");
    assert.equal(idleStatus.status, 200);
    assert.equal(idleStatus.body.active, false);
    assert.equal(idleStatus.body.run?.status, "aborted");
    assert.ok(stopRecordingCalls >= 1, "terminal cleanup should stop recording through test deps");
    assert.ok(manifestSaveCalls >= 1, "terminal cleanup should save a manifest through test deps");

    assert.ok(eventCalls.length >= 5, "expected route tests to emit kitchen events");
    console.log("[kitchen-routes] all checks passed");
  } finally {
    await server.close();
    resetKitchenRouteDepsForTests();
    resetKitchenTrackerForTests();
    if (previousStepSegmentsEnabled === undefined) delete process.env.LABOS_STEP_SEGMENTS_ENABLED;
    else process.env.LABOS_STEP_SEGMENTS_ENABLED = previousStepSegmentsEnabled;
    if (previousConfirmValidationEnabled === undefined) delete process.env.LABOS_CONFIRM_STEP_VALIDATION_ENABLED;
    else process.env.LABOS_CONFIRM_STEP_VALIDATION_ENABLED = previousConfirmValidationEnabled;
    if (previousSupervisorEnabled === undefined) delete process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
    else process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = previousSupervisorEnabled;
  }
}

void main();
