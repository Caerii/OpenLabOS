import { Router } from "express";
import fs from "fs";
import {
  attachKitchenNativeVideoArtifact,
  buildKitchenSessionManifest,
  analyzeSavedKitchenSessionBoundaries,
  listKitchenSessionManifests,
  queueSavedKitchenSessionManifestAnalysis,
  queueSavedKitchenSessionManifestVqa,
  readKitchenSessionManifestFile,
  saveKitchenSessionManifest,
} from "../../ai/kitchen/index.js";
import { resolveKitchenArtifactRef } from "../../ai/kitchen/artifact-refs.js";
import { ensureKitchenCaptureReadiness } from "../../ai/kitchen/capture-readiness.js";
import {
  buildKitchenRunLibrary,
  buildKitchenRunReview,
} from "../../ai/kitchen/run-catalog.js";
import {
  cachedNativeVideoArtifactsForManifest,
  warmKitchenNativeVideoCacheForManifest,
} from "../../ai/kitchen/video-artifact-cache.js";
import { getLabOSFeatureConfig } from "../../config/features.js";
import { asyncRoute, badRequest, notFound } from "../../lib/http.js";
import { maybeQueuePostRunVqa } from "./post-run-vqa.js";

function parseRunId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveKitchenArtifactPath(ref: string) {
  try {
    return resolveKitchenArtifactRef(ref, {
      allowedKinds: ["frame", "chunk", "native_video"],
    }).localPath;
  } catch (error: any) {
    badRequest(error?.message || "Invalid kitchen artifact ref");
  }
}

export function registerKitchenSessionRoutes(router: Router) {
  router.get("/session/run-library", asyncRoute(async (_req, res) => {
    res.json(await buildKitchenRunLibrary());
  }));

  router.get("/session/run-library/:runId", asyncRoute(async (req, res) => {
    try {
      res.json(await buildKitchenRunReview(req.params.runId));
    } catch (error: any) {
      badRequest(error?.message || "Failed to build saved kitchen run review");
    }
  }));

  router.get("/session/manifests", asyncRoute(async (_req, res) => {
    res.json({ manifests: await listKitchenSessionManifests() });
  }));

  router.get("/session/artifact", asyncRoute(async (req, res) => {
    const ref = typeof req.query.ref === "string" ? req.query.ref : "";
    const artifactPath = resolveKitchenArtifactPath(ref);
    if (!fs.existsSync(artifactPath)) {
      notFound("Kitchen artifact not found");
    }
    const stat = fs.statSync(artifactPath);
    if (!stat.isFile()) {
      notFound("Kitchen artifact not found");
    }
    if (stat.size <= 0) {
      badRequest("Kitchen artifact is empty");
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (req.query.download === "1") {
      res.download(artifactPath);
      return;
    }
    res.sendFile(artifactPath);
  }));

  router.get("/session/manifests/:runId", asyncRoute(async (req, res) => {
    try {
      const manifest = ensureKitchenCaptureReadiness(await readKitchenSessionManifestFile(req.params.runId) as any);
      warmKitchenNativeVideoCacheForManifest(manifest);
      const nativeVideoArtifacts = await cachedNativeVideoArtifactsForManifest(manifest);
      res.json({ ...manifest, nativeVideoArtifacts });
    } catch (error: any) {
      badRequest(error?.message || "Failed to read saved kitchen session manifest");
    }
  }));

  router.post("/session/manifests/:runId/native-video-artifacts", asyncRoute(async (req, res) => {
    const devicePath = typeof req.body?.devicePath === "string" ? req.body.devicePath.trim() : "";
    const localPath = typeof req.body?.localPath === "string" ? req.body.localPath.trim() : "";
    if (!devicePath) badRequest("devicePath is required");
    if (!localPath) badRequest("localPath is required");
    try {
      const attached = await attachKitchenNativeVideoArtifact(req.params.runId, {
        devicePath,
        localPath,
        sha256: typeof req.body?.sha256 === "string" ? req.body.sha256 : undefined,
        sourceDeviceSerial: typeof req.body?.sourceDeviceSerial === "string" ? req.body.sourceDeviceSerial : undefined,
        stepNumber: Number.isFinite(Number(req.body?.stepNumber)) ? Number(req.body.stepNumber) : undefined,
        attemptId: typeof req.body?.attemptId === "string" ? req.body.attemptId : undefined,
      });
      const nativeVideoArtifacts = await cachedNativeVideoArtifactsForManifest(attached.manifest);
      res.json({ success: true, ...attached, manifest: { ...attached.manifest, nativeVideoArtifacts } });
    } catch (error: any) {
      badRequest(error?.message || "Failed to attach native video artifact");
    }
  }));

  router.get("/session/manifest", asyncRoute(async (req, res) => {
    try {
      res.json(await buildKitchenSessionManifest(parseRunId(req.query.runId)));
    } catch (error: any) {
      badRequest(error?.message || "Failed to build kitchen session manifest");
    }
  }));

  router.post("/session/manifest/save", asyncRoute(async (req, res) => {
    try {
      const saved = await saveKitchenSessionManifest(parseRunId(req.body?.runId));
      warmKitchenNativeVideoCacheForManifest(saved.manifest);
      const postRunVqa = await maybeQueuePostRunVqa(saved.manifest.run.id);
      res.json({ success: true, ...saved, postRunVqa });
    } catch (error: any) {
      badRequest(error?.message || "Failed to save kitchen session manifest");
    }
  }));

  router.post("/session/manifests/:runId/analyze", asyncRoute(async (req, res) => {
    if (!getLabOSFeatureConfig().effectiveFlags.asyncStepAnalysisEnabled) {
      badRequest("Async step analysis is disabled by feature flag");
    }
    try {
      const queued = await queueSavedKitchenSessionManifestAnalysis(req.params.runId, {
        modelId: typeof req.body?.modelId === "string" ? req.body.modelId : undefined,
        force: req.body?.force === true,
        retryErrors: req.body?.retryErrors !== false,
      });
      res.json({ success: true, ...queued });
    } catch (error: any) {
      badRequest(error?.message || "Failed to queue saved run analysis");
    }
  }));

  router.post("/session/manifests/:runId/vqa", asyncRoute(async (req, res) => {
    if (!getLabOSFeatureConfig().effectiveFlags.postRunVqaEnabled) {
      badRequest("Post-run VQA annotation is disabled by feature flag");
    }
    try {
      const queued = await queueSavedKitchenSessionManifestVqa(req.params.runId, {
        modelId: typeof req.body?.modelId === "string" ? req.body.modelId : undefined,
        force: req.body?.force === true,
        retryErrors: req.body?.retryErrors !== false,
      });
      res.json({ success: true, ...queued });
    } catch (error: any) {
      badRequest(error?.message || "Failed to queue saved run VQA annotations");
    }
  }));

  router.post("/session/manifests/:runId/vqa-boundaries", asyncRoute(async (req, res) => {
    if (!getLabOSFeatureConfig().effectiveFlags.postRunVqaEnabled) {
      badRequest("Post-run VQA boundary analysis is disabled by feature flag");
    }
    try {
      const analysis = await analyzeSavedKitchenSessionBoundaries(req.params.runId, {
        modelId: typeof req.body?.modelId === "string" ? req.body.modelId : undefined,
        threshold: Number.isFinite(Number(req.body?.threshold)) ? Number(req.body.threshold) : undefined,
        window: Number.isFinite(Number(req.body?.window)) ? Number(req.body.window) : undefined,
        forceSteps: Array.isArray(req.body?.forceSteps) ? req.body.forceSteps.map(Number) : undefined,
      });
      res.json({ success: true, analysis });
    } catch (error: any) {
      badRequest(error?.message || "Failed to run saved run VQA boundary analysis");
    }
  }));
}
