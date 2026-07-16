import {
  DEFAULT_MULTISCALE_POLICY,
  aggregateMultiscaleEvidence,
  buildModeForValidationCheck,
  evidenceFromError,
  evidenceFromResult,
  getStepPlanOrThrow,
  selectExecutableValidationChecks,
  type ValidationScale,
} from "../../ai/kitchen/multiscale-validation.js";
import { runEntitySegmentation } from "../../ai/kitchen/entity-segmentation.js";
import { buildStepVqaQuestions, normalizeStepVqaAnnotation } from "../../ai/kitchen/vqa-annotations.js";
import { getLabOSFeatureConfig } from "../../config/features.js";
import { materializeRecentPreviewChunk, type MaterializedPreviewChunk } from "../../ai/kitchen/live-chunks.js";
import { badRequest } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { getProtocolStepOrThrow } from "./shared.js";

export function parseValidationScales(value: unknown): ValidationScale[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const valid = new Set(["frame", "short_chunk", "step_window", "session"]);
  const scales = raw.map((item) => String(item)).filter((item): item is ValidationScale => valid.has(item));
  if (scales.length !== raw.length) {
    badRequest("scales must contain only frame, short_chunk, step_window, or session");
  }
  return scales;
}

function hasExplicitFrameInput(opts: { frameBuffer?: Buffer; testImageUrl?: string }) {
  return !!opts.frameBuffer || !!opts.testImageUrl;
}

function hasExplicitVideoInput(opts: { videoUrl?: string; videoFilePath?: string }) {
  return !!opts.videoUrl || !!opts.videoFilePath;
}

export async function executeStepMultiscaleValidation(input: {
  protocolId: string;
  stepNumber: number;
  body?: any;
  runId?: string;
  defaultScales?: ValidationScale[];
  defaultMaxChecks?: number;
}) {
  const { protocol, step } = getProtocolStepOrThrow(input.protocolId, input.stepNumber);
  const plan = getStepPlanOrThrow(protocol, input.stepNumber);
  const opts = getKitchenRouteDeps().extractEROptions(input.body || {});
  const includeVqaAnnotations =
    getLabOSFeatureConfig().effectiveFlags.liveVqaEnabled ||
    input.body?.includeVqaAnnotations === true ||
    input.body?.includeVqa === true;
  const vqaOnly = input.body?.vqaOnly === true;
  const executablePlan = includeVqaAnnotations
    ? vqaOnly
      ? { ...plan, checks: plan.checks.filter((validationCheck) => validationCheck.modeId === "vqa-annotation") }
      : plan
    : { ...plan, checks: plan.checks.filter((validationCheck) => validationCheck.modeId !== "vqa-annotation") };
  const scales = parseValidationScales(input.body?.scales) ?? input.defaultScales;
  const maxChecks = Number.isFinite(Number(input.body?.maxChecks))
    ? Number(input.body.maxChecks)
    : input.defaultMaxChecks ?? 5;
  const canUseRollingChunk = !!input.runId && input.body?.useRollingChunk !== false;
  const selectionOpts = canUseRollingChunk
    ? {
        ...opts,
        videoUrl: opts.videoUrl || "rolling-preview://recent",
        videoFps: opts.videoFps || DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
      }
    : opts;
  const selectedChecks = selectExecutableValidationChecks(executablePlan, selectionOpts, scales, maxChecks);
  if (!selectedChecks.length) {
    badRequest("No executable validation checks matched the provided scales and inputs");
  }

  const needsCapturedFrame = selectedChecks.some((check) => check.scale === "frame") && !hasExplicitFrameInput(opts);
  const frameBuffer = needsCapturedFrame ? await getKitchenRouteDeps().captureFrame() : opts.frameBuffer;
  const needsRollingChunk =
    selectedChecks.some((check) => check.scale === "short_chunk") &&
    !hasExplicitVideoInput(opts) &&
    canUseRollingChunk;
  const rollingChunk: MaterializedPreviewChunk | null = needsRollingChunk
    ? await materializeRecentPreviewChunk({
        runId: input.runId,
        protocolId: input.protocolId,
        stepNumber: input.stepNumber,
        windowMs: Number(input.body?.chunkWindowMs) > 0
          ? Number(input.body.chunkWindowMs)
          : DEFAULT_MULTISCALE_POLICY.shortChunkSeconds * 1000,
        fps: Number(input.body?.videoFps) > 0
          ? Number(input.body.videoFps)
          : DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
      }).catch(() => null)
    : null;
  const runOpts = {
    ...opts,
    frameBuffer,
    ...(rollingChunk
      ? {
          videoFilePath: rollingChunk.videoFilePath,
          videoMimeType: "video/mp4",
        }
      : {}),
    videoFps: opts.videoFps || DEFAULT_MULTISCALE_POLICY.defaultVideoFps,
  };

  const evidence = [];
  for (const validationCheck of selectedChecks) {
    try {
      if (validationCheck.modeId === "entity-segmentation") {
        const prompts = step.requiredObjects?.length
          ? step.requiredObjects
          : protocol.requiredInventory.map((item) => item.name);
        const segmentation = await runEntitySegmentation({
          frameBuffer,
          imageUrl: opts.testImageUrl,
          prompts,
          includeMasks: input.body?.includeEntityMasks !== false,
          includeTracks: true,
          sessionId: input.runId,
          frameId: `${input.protocolId}:step-${input.stepNumber}`,
          timestampMs: Date.now(),
        });
        evidence.push(evidenceFromResult(
          validationCheck,
          {
            raw: JSON.stringify(segmentation),
            parsed: segmentation,
            latencyMs: segmentation.latencyMs,
          },
          step,
        ));
        continue;
      }

      const mode = buildModeForValidationCheck(protocol, step, validationCheck);
      const result = await getKitchenRouteDeps().runERMode(mode, runOpts);
      const normalizedResult = validationCheck.modeId === "vqa-annotation"
        ? {
            ...result,
            parsed: normalizeStepVqaAnnotation({
              protocol,
              step,
              parsed: result.parsed,
              questions: buildStepVqaQuestions(protocol, step),
            }),
          }
        : result;
      evidence.push(evidenceFromResult(
        validationCheck,
        normalizedResult,
        step,
        validationCheck.scale === "short_chunk" && rollingChunk
          ? { artifactRef: rollingChunk.chunkRef, artifactKind: "video_chunk" }
          : undefined,
      ));
    } catch (error) {
      evidence.push(evidenceFromError(validationCheck, error));
    }
  }

  return {
    protocol,
    step,
    plan,
    selectedChecks,
    evidence,
    decision: aggregateMultiscaleEvidence(plan, evidence),
    frameBuffer,
    rollingChunk,
    runOpts,
  };
}
