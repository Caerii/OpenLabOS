import { Router } from "express";
import { DEFAULT_ER_MODEL, hasVideoChunkMetadata } from "../../ai/kitchen/er-runtime.js";
import { successCheckMode } from "../../ai/kitchen/index.js";
import { buildTeacherJudgmentMode } from "../../ai/kitchen/teacher-judgment.js";
import { buildTeacherVerificationResult, composeVerifyStepPrompt } from "../../ai/kitchen/verification.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { isYouTubeUrl } from "../../ai/kitchen/video-analysis.js";
import { getKitchenRouteDeps } from "./deps.js";
import {
  buildJudgmentAgreement,
  getProtocolStepOrThrow,
  materializeFrameBuffer,
  parseTeacherStepRequest,
  queueKitchenEvent,
  resolveFrameInput,
  saveFrameIfPresent,
  toClosedWorldStepId,
  validateJudgmentWithState,
} from "./shared.js";

export function registerKitchenTeacherRoutes(router: Router) {
  router.post("/teacher/verify-step", asyncRoute(async (req, res) => {
    const { protocolId, stepNumber } = parseTeacherStepRequest(req.body);
    const { step } = getProtocolStepOrThrow(protocolId, stepNumber);
    const { modelId, frameBuffer, testImageUrl } = await resolveFrameInput(req.body);
    const resolvedModelId = modelId || DEFAULT_ER_MODEL;

    const mode = successCheckMode(composeVerifyStepPrompt(step));
    const result = await getKitchenRouteDeps().runERMode(mode, {
      modelId: resolvedModelId,
      frameBuffer,
      testImageUrl,
    });
    const frameRef = await saveFrameIfPresent(frameBuffer, `teacher-verify-step${stepNumber}-${protocolId}`);

    const verification = buildTeacherVerificationResult(result, frameRef, {
      protocolId,
      stepNumber,
      modelId: resolvedModelId,
    });

    queueKitchenEvent({
      type: "verify_step",
      runId: null,
      protocolId,
      payload: { stepNumber, verification, latencyMs: result.latencyMs, teacher: true },
    });

    res.json({ success: true, verification, frameRef, latencyMs: result.latencyMs });
  }));

  router.post("/teacher/judgment", asyncRoute(async (req, res) => {
    const { protocolId, stepNumber } = parseTeacherStepRequest(req.body);
    const { step } = getProtocolStepOrThrow(protocolId, stepNumber);
    const step_id = toClosedWorldStepId(protocolId, stepNumber);
    const { modelId, frameBuffer, testImageUrl } = await resolveFrameInput(req.body);

    const frameRef = await saveFrameIfPresent(frameBuffer, `teacher-judgment-step${stepNumber}-${protocolId}`);
    const mode = buildTeacherJudgmentMode({
      protocolId,
      stepNumber,
      stepId: step_id,
      step,
    });

    const result = await getKitchenRouteDeps().runERMode(mode, {
      modelId: modelId || DEFAULT_ER_MODEL,
      frameBuffer,
      testImageUrl,
    });

    const validated = validateJudgmentWithState(result.parsed, step_id);
    if (!validated.validSchema || !validated.judgment) {
      res.status(502).json({
        error: "Teacher output failed schema validation",
        raw: result.raw,
        parsed: result.parsed,
        validationError: validated.validationError,
        frameRef,
      });
      return;
    }

    queueKitchenEvent({
      type: "verify_step",
      runId: null,
      protocolId,
      payload: {
        stepNumber,
        frameRef,
        teacher: true,
        judgment: validated.judgment,
        latencyMs: result.latencyMs,
      },
    });

    res.json({ success: true, judgment: validated.judgment, frameRef, latencyMs: result.latencyMs });
  }));

  router.post("/teacher/judgment/video", asyncRoute(async (req, res) => {
    const { protocolId, stepNumber } = parseTeacherStepRequest(req.body);
    const { step } = getProtocolStepOrThrow(protocolId, stepNumber);
    const step_id = toClosedWorldStepId(protocolId, stepNumber);
    const erOpts = getKitchenRouteDeps().extractEROptions(req.body);

    if (!erOpts.videoUrl) badRequest("videoUrl is required");
    if (!isYouTubeUrl(erOpts.videoUrl)) badRequest("videoUrl must be a valid YouTube URL");
    if (!hasVideoChunkMetadata(erOpts)) {
      badRequest("videoStartOffsetSec, videoEndOffsetSec, or videoFps is required");
    }

    const mode = buildTeacherJudgmentMode({
      protocolId,
      stepNumber,
      stepId: step_id,
      step,
    });

    const result = await getKitchenRouteDeps().runERMode(mode, {
      ...erOpts,
      modelId: erOpts.modelId || DEFAULT_ER_MODEL,
    });

    const validated = validateJudgmentWithState(result.parsed, step_id);
    if (!validated.validSchema || !validated.judgment) {
      res.status(502).json({
        error: "Teacher output failed schema validation",
        raw: result.raw,
        parsed: result.parsed,
        validationError: validated.validationError,
      });
      return;
    }

    res.json({
      success: true,
      judgment: validated.judgment,
      clip: {
        videoUrl: erOpts.videoUrl,
        videoStartOffsetSec: erOpts.videoStartOffsetSec,
        videoEndOffsetSec: erOpts.videoEndOffsetSec,
        videoFps: erOpts.videoFps,
      },
      latencyMs: result.latencyMs,
    });
  }));

  router.post("/teacher/student/compare", asyncRoute(async (req, res) => {
    const { protocolId, stepNumber } = parseTeacherStepRequest(req.body);
    const { step } = getProtocolStepOrThrow(protocolId, stepNumber);
    const step_id = toClosedWorldStepId(protocolId, stepNumber);
    const { teacherModelId, studentModelId, saveToDataset = true, tags } = req.body || {};
    if (!studentModelId || typeof studentModelId !== "string") {
      badRequest("studentModelId is required");
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      badRequest("tags must be an array when provided");
    }

    const { frameBuffer, testImageUrl } = await resolveFrameInput(req.body);
    const materializedFrame = await materializeFrameBuffer(frameBuffer, testImageUrl);
    if (!materializedFrame) {
      badRequest("Frame input is required");
    }

    const frameRef = await saveFrameIfPresent(materializedFrame, `teacher-student-step${stepNumber}-${protocolId}`);
    const mode = buildTeacherJudgmentMode({
      protocolId,
      stepNumber,
      stepId: step_id,
      step,
    });

    const resolvedTeacherModelId =
      typeof teacherModelId === "string" && teacherModelId.trim() ? teacherModelId : DEFAULT_ER_MODEL;

    const [teacherResult, studentResult] = await Promise.all([
      getKitchenRouteDeps().runERMode(mode, {
        modelId: resolvedTeacherModelId,
        frameBuffer: materializedFrame,
      }),
      getKitchenRouteDeps().runERMode(mode, {
        modelId: studentModelId,
        frameBuffer: materializedFrame,
      }),
    ]);

    const teacherValidated = validateJudgmentWithState(teacherResult.parsed, step_id);
    if (!teacherValidated.validSchema || !teacherValidated.judgment) {
      res.status(502).json({
        error: "Teacher output failed schema validation",
        teacher: {
          modelId: resolvedTeacherModelId,
          raw: teacherResult.raw,
          parsed: teacherResult.parsed,
          validationError: teacherValidated.validationError,
        },
        frameRef,
      });
      return;
    }

    const studentValidated = validateJudgmentWithState(studentResult.parsed, step_id);
    const agreement = buildJudgmentAgreement(
      teacherValidated.judgment,
      studentValidated.judgment,
    );

    const teacherPayload = {
      modelId: resolvedTeacherModelId,
      latencyMs: teacherResult.latencyMs,
      raw: teacherResult.raw,
      parsed: teacherResult.parsed,
      validSchema: true,
      judgment: teacherValidated.judgment,
    };
    const studentPayload = {
      modelId: studentModelId,
      latencyMs: studentResult.latencyMs,
      raw: studentResult.raw,
      parsed: studentResult.parsed,
      validSchema: studentValidated.validSchema,
      ...(studentValidated.validSchema ? { judgment: studentValidated.judgment } : { validationError: studentValidated.validationError }),
    };

    let savedPairId: string | undefined;
    if (saveToDataset) {
      const record = await getKitchenRouteDeps().saveSupervisionPair(materializedFrame, {
        timestamp: Date.now(),
        taskType: "kitchen-step-judgment",
        protocolId,
        stepNumber,
        stepId: step_id,
        prompt: mode.prompt,
        teacher: {
          modelId: teacherPayload.modelId,
          latencyMs: teacherPayload.latencyMs,
          raw: teacherPayload.raw,
          parsed: teacherPayload.parsed,
          validSchema: true,
        },
        student: {
          modelId: studentPayload.modelId,
          latencyMs: studentPayload.latencyMs,
          raw: studentPayload.raw,
          parsed: studentPayload.parsed,
          validSchema: studentPayload.validSchema,
          ...(studentValidated.validSchema ? {} : { validationError: studentValidated.validationError }),
        },
        agreement: agreement || undefined,
        tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0) : undefined,
      });
      savedPairId = record.id;
    }

    res.json({
      success: true,
      frameRef,
      teacher: teacherPayload,
      student: studentPayload,
      agreement,
      savedPairId,
    });
  }));
}
