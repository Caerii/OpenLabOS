import { Request, Response, Router } from "express";
import { analyzeRouteConfigs, type AnalyzeRouteConfig } from "../../ai/kitchen/analysis-configs.js";
import { getEntitySegmentationStatus, runEntitySegmentation } from "../../ai/kitchen/entity-segmentation.js";
import { FALLBACK_MODEL, hasBeforeAfterInputs, hasVideoChunkMetadata } from "../../ai/kitchen/er-runtime.js";
import { listAvailableModes, nextStepGuidanceMode } from "../../ai/kitchen/index.js";
import {
  buildSearchGroundedMode,
  buildVideoAnalysisMode,
  buildVideoToProtocolMode,
  isYouTubeUrl,
  trySaveExtractedProtocol,
} from "../../ai/kitchen/video-analysis.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { getCurrentRunOrThrow, getCurrentStepOrThrow, getProtocolOrThrow } from "./shared.js";

function parseSegmentationPrompts(body: any) {
  const raw = Array.isArray(body?.prompts)
    ? body.prompts
    : Array.isArray(body?.objects)
      ? body.objects
      : typeof body?.prompt === "string"
        ? body.prompt.split(",")
        : [];
  const prompts = Array.from(new Set<string>(
    raw.map((item: unknown) => String(item).trim()).filter(Boolean),
  ));
  if (!prompts.length) badRequest("prompts or objects array is required");
  return prompts;
}

function postAnalyzeRoute(router: Router, { path, build }: AnalyzeRouteConfig) {
  router.post(path, asyncRoute(async (req, res) => {
    let built: Awaited<ReturnType<AnalyzeRouteConfig["build"]>>;
    try {
      built = await build(req.body);
    } catch (e: any) {
      badRequest(e.message);
    }
    const { mode, extra = {} } = built;
    const opts = getKitchenRouteDeps().extractEROptions(req.body);
    if (mode.id === "before-after" && !hasBeforeAfterInputs(opts)) {
      badRequest("before/after inputs are required. Provide beforeImage + afterImage, or beforeImageUrl + afterImageUrl.");
    }
    const result = await getKitchenRouteDeps().runERMode(mode, opts);
    const count = path === "/analyze/count" && Array.isArray(result.parsed) ? result.parsed.length : undefined;
    res.json({ mode: mode.id, ...(count !== undefined ? { count } : {}), ...extra, ...result });
  }));
}

export function registerKitchenAnalyzeRoutes(router: Router) {
  analyzeRouteConfigs.forEach((config) => postAnalyzeRoute(router, config));

  router.post("/analyze/next-step", asyncRoute(async (req, res) => {
    const protocol = getProtocolOrThrow(getCurrentRunOrThrow().protocolId);
    const currentStep = getCurrentStepOrThrow();

    const mode = nextStepGuidanceMode(
      protocol.name,
      currentStep.step.number - 1,
      currentStep.step.instruction,
      currentStep.step.requiredObjects,
    );
    const result = await getKitchenRouteDeps().runERMode(mode, getKitchenRouteDeps().extractEROptions(req.body));
    res.json({ mode: mode.id, step: currentStep.step, ...result });
  }));

  router.post("/analyze/video", asyncRoute(async (req, res) => {
    const { prompt } = req.body || {};
    const erOpts = getKitchenRouteDeps().extractEROptions(req.body);
    if (!erOpts.videoUrl) badRequest("videoUrl is required");
    if (!isYouTubeUrl(erOpts.videoUrl)) badRequest("videoUrl must be a valid YouTube URL");

    const mode = buildVideoAnalysisMode(prompt);
    const result = await getKitchenRouteDeps().runERMode(mode, {
      ...erOpts,
      useSearch: erOpts.useSearch ?? true,
      thinkingLevel: erOpts.thinkingLevel || "high",
    });

    res.json({
      mode: mode.id,
      videoUrl: erOpts.videoUrl,
      ...(hasVideoChunkMetadata(erOpts)
        ? {
            clip: {
              videoStartOffsetSec: erOpts.videoStartOffsetSec,
              videoEndOffsetSec: erOpts.videoEndOffsetSec,
              videoFps: erOpts.videoFps,
            },
          }
        : {}),
      ...result,
    });
  }));

  router.post("/analyze/video/to-protocol", asyncRoute(async (req, res) => {
    const { protocolId } = req.body || {};
    const erOpts = getKitchenRouteDeps().extractEROptions(req.body);
    if (!erOpts.videoUrl) badRequest("videoUrl is required");
    if (!isYouTubeUrl(erOpts.videoUrl)) badRequest("videoUrl must be a valid YouTube URL");

    const mode = buildVideoToProtocolMode(protocolId);
    const result = await getKitchenRouteDeps().runERMode(mode, {
      ...erOpts,
      useSearch: erOpts.useSearch ?? true,
      thinkingLevel: erOpts.thinkingLevel || "high",
    });

    const protocol = result.parsed;
    const savedPath = trySaveExtractedProtocol(protocol, erOpts.videoUrl);

    res.json({
      mode: mode.id,
      videoUrl: erOpts.videoUrl,
      protocol,
      saved: !!savedPath,
      savedPath,
      ...(hasVideoChunkMetadata(erOpts)
        ? {
            clip: {
              videoStartOffsetSec: erOpts.videoStartOffsetSec,
              videoEndOffsetSec: erOpts.videoEndOffsetSec,
              videoFps: erOpts.videoFps,
            },
          }
        : {}),
      ...result,
    });
  }));

  router.post("/analyze/search", asyncRoute(async (req, res) => {
    const { query, modelId } = req.body || {};
    if (!query) badRequest("query is required");

    const mode = buildSearchGroundedMode(query);
    const opts = getKitchenRouteDeps().extractEROptions(req.body);
    opts.useSearch = true;
    opts.modelId = modelId || FALLBACK_MODEL;
    if (!opts.frameBuffer && !opts.testImageUrl && !opts.videoUrl) {
      opts.textOnly = true;
    }

    const result = await getKitchenRouteDeps().runERMode(mode, opts);
    res.json({ mode: mode.id, ...result });
  }));

  router.post("/analyze/entity-segmentation", asyncRoute(async (req, res) => {
    const prompts = parseSegmentationPrompts(req.body);
    const opts = getKitchenRouteDeps().extractEROptions(req.body);
    const frameBuffer = opts.frameBuffer || (!opts.testImageUrl ? await getKitchenRouteDeps().captureFrame() : undefined);
    const result = await runEntitySegmentation({
      frameBuffer,
      imageUrl: opts.testImageUrl,
      prompts,
      includeMasks: req.body?.includeMasks !== false,
      includeTracks: req.body?.includeTracks !== false,
      sessionId: req.body?.sessionId,
      frameId: req.body?.frameId,
      timestampMs: Number.isFinite(Number(req.body?.timestampMs)) ? Number(req.body.timestampMs) : Date.now(),
    });

    res.json({
      mode: "entity-segmentation",
      raw: JSON.stringify(result),
      parsed: result,
      latencyMs: result.latencyMs,
    });
  }));

  router.get("/analyze/entity-segmentation/status", asyncRoute(async (req, res) => {
    res.json(await getEntitySegmentationStatus(req.query.probe === "1" || req.query.probe === "true"));
  }));

  router.get("/modes", (_req: Request, res: Response) => {
    res.json({ modes: listAvailableModes() });
  });
}
