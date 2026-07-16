/**
 * One-shot ER/perception primitives used by developer tools and demo sandboxes.
 */

import { inputOpts } from "./input";
import { kitchenAnalyzePost, kitchenGet } from "./transport";
import type { EntitySegmentationResult, EntitySegmentationStatus, ERAnalysisResult, ERInputOptions } from "./types";

export const kitchenAnalyzeSpatial = (opts?: { maxItems?: number } & ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("spatial", opts || {});

export const kitchenAnalyzeObjects = (objects: string[], modelIdOrOpts?: string | ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("objects", { objects, ...inputOpts(modelIdOrOpts) });

export const kitchenAnalyzeBoxes = (opts?: { maxObjects?: number } & ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("boxes", opts || {});

export const kitchenAnalyzeTrajectory = (
  from: string,
  to: string,
  opts?: { numPoints?: number } & ERInputOptions,
) => kitchenAnalyzePost<ERAnalysisResult>("trajectory", { from, to, ...opts });

export const kitchenAnalyzeInstrument = (instrument: string, modelIdOrOpts?: string | ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("instrument", { instrument, ...inputOpts(modelIdOrOpts) });

export const kitchenAnalyzeLiquidLevel = (
  container: string,
  opts?: { targetMl?: number } & ERInputOptions,
) => kitchenAnalyzePost<ERAnalysisResult>("liquid-level", { container, ...opts });

export const kitchenAnalyzeCount = (object: string, modelIdOrOpts?: string | ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult & { count: number | null }>("count", { object, ...inputOpts(modelIdOrOpts) });

export const kitchenAnalyzeSafety = (currentActivity?: string, modelIdOrOpts?: string | ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("safety", { currentActivity, ...inputOpts(modelIdOrOpts) });

export const kitchenAnalyzeHands = (modelIdOrOpts?: string | ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("hands", inputOpts(modelIdOrOpts));

export const kitchenAnalyzeWorkspaceClear = (needSpaceFor: string, opts?: ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("workspace-clear", { needSpaceFor, ...opts });

export const kitchenAnalyzeSuccessCheck = (verificationPrompt: string, opts?: ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("success-check", { verificationPrompt, ...opts });

export const kitchenAnalyzeBeforeAfter = (taskDescription: string, opts: ERInputOptions) =>
  kitchenAnalyzePost<ERAnalysisResult>("before-after", { taskDescription, ...opts });

export const kitchenAnalyzeEntitySegmentation = (
  prompts: string[],
  opts?: ERInputOptions & {
    includeMasks?: boolean;
    includeTracks?: boolean;
    sessionId?: string;
    frameId?: string;
    timestampMs?: number;
  },
) => kitchenAnalyzePost<ERAnalysisResult & { parsed: EntitySegmentationResult }>(
  "entity-segmentation",
  { prompts, ...(opts || {}) },
);

export const kitchenEntitySegmentationStatus = (probe = false) =>
  kitchenGet<EntitySegmentationStatus>(`analyze/entity-segmentation/status${probe ? "?probe=1" : ""}`);

