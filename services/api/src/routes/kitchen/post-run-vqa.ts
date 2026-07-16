import { queueSavedKitchenSessionManifestVqa } from "../../ai/kitchen/index.js";
import { getLabOSFeatureConfig } from "../../config/features.js";

export interface PostRunVqaAutoQueueResult {
  enabled: boolean;
  queued: boolean;
  reason?: string;
  runId?: string;
  modelId?: string;
  queuedSegmentCount?: number;
  skippedSegmentCount?: number;
  queuedStepNumbers?: number[];
  error?: string;
}

export async function maybeQueuePostRunVqa(runId?: string | null): Promise<PostRunVqaAutoQueueResult> {
  if (!getLabOSFeatureConfig().effectiveFlags.postRunVqaEnabled) {
    return { enabled: false, queued: false, reason: "feature_disabled" };
  }
  if (!runId) {
    return { enabled: true, queued: false, reason: "missing_run_id" };
  }
  try {
    const result = await queueSavedKitchenSessionManifestVqa(runId, { retryErrors: true });
    return {
      enabled: true,
      queued: result.queuedSegmentCount > 0,
      reason: result.queuedSegmentCount > 0 ? "queued" : "already_annotated",
      runId,
      modelId: result.modelId,
      queuedSegmentCount: result.queuedSegmentCount,
      skippedSegmentCount: result.skippedSegmentCount,
      queuedStepNumbers: result.queuedStepNumbers,
    };
  } catch (error: any) {
    return {
      enabled: true,
      queued: false,
      reason: "queue_failed",
      runId,
      error: error?.message || String(error),
    };
  }
}
