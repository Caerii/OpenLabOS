/**
 * Session manifest calls for replayable Kitchen runs and training export.
 */

import { kitchenGet, kitchenPost } from "./transport";
import type {
  KitchenRunLibrary,
  KitchenRunReview,
  KitchenNativeVideoArtifact,
  KitchenPostRunVqaAutoQueueResult,
  KitchenSavedManifestAnalysisQueueResult,
  KitchenSavedManifestVqaQueueResult,
  KitchenSavedManifestSummary,
  KitchenSessionManifest,
} from "./types";

export const kitchenSessionManifest = (runId?: string) =>
  kitchenGet<KitchenSessionManifest>(`session/manifest${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`);

export const kitchenSavedSessionManifests = () =>
  kitchenGet<{ manifests: KitchenSavedManifestSummary[] }>("session/manifests");

export const kitchenRunLibrary = () =>
  kitchenGet<KitchenRunLibrary>("session/run-library");

export const kitchenSavedSessionManifest = (runId: string) =>
  kitchenGet<KitchenSessionManifest>(`session/manifests/${encodeURIComponent(runId)}`);

export const kitchenSavedRunReview = (runId: string) =>
  kitchenGet<KitchenRunReview>(`session/run-library/${encodeURIComponent(runId)}`);

export const kitchenSaveSessionManifest = (runId?: string) =>
  kitchenPost<{ success: boolean; manifest: KitchenSessionManifest; manifestRef: string; postRunVqa?: KitchenPostRunVqaAutoQueueResult }>(
    "session/manifest/save",
    runId ? { runId } : {},
  );

export const kitchenAttachNativeVideoArtifact = (
  runId: string,
  input: {
    devicePath: string;
    localPath: string;
    sha256?: string;
    sourceDeviceSerial?: string;
    stepNumber?: number;
    attemptId?: string;
  },
) =>
  kitchenPost<{
    success: boolean;
    manifest: KitchenSessionManifest;
    manifestRef: string;
    artifact: KitchenNativeVideoArtifact;
  }>(
    `session/manifests/${encodeURIComponent(runId)}/native-video-artifacts`,
    input,
  );

export const kitchenAnalyzeSavedSessionManifest = (
  runId: string,
  opts?: { modelId?: string; force?: boolean; retryErrors?: boolean },
) =>
  kitchenPost<{ success: boolean } & KitchenSavedManifestAnalysisQueueResult>(
    `session/manifests/${encodeURIComponent(runId)}/analyze`,
    opts || {},
  );

export const kitchenAnnotateSavedSessionManifestVqa = (
  runId: string,
  opts?: { modelId?: string; force?: boolean; retryErrors?: boolean },
) =>
  kitchenPost<{ success: boolean } & KitchenSavedManifestVqaQueueResult>(
    `session/manifests/${encodeURIComponent(runId)}/vqa`,
    opts || {},
  );
