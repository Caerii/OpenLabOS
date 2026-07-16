/**
 * Deterministic spatial summaries for protocol voice guidance.
 *
 * Vision models and segmentation sidecars can return points, boxes, and masks
 * in different coordinate frames. This module reduces them to one compact
 * 0-1000 workspace frame so Live Coach can say things like "the mug on the
 * right" without inventing spatial certainty from raw video alone.
 */

import type {
  EntityBox,
  EntityObservation,
  EntitySegmentationResult,
} from "./entity-segmentation.js";
import type { MultiscaleEvidence } from "./multiscale-types.js";

export type SpatialHorizontalRegion = "left" | "center" | "right";
export type SpatialVerticalRegion = "top" | "middle" | "bottom";

export interface SpatialObjectSummary {
  label: string;
  confidence: number;
  x: number;
  y: number;
  horizontal: SpatialHorizontalRegion;
  vertical: SpatialVerticalRegion;
  phrase: string;
  source: EntityObservation["source"];
}

export interface SpatialSummary {
  generatedAtMs: number;
  provider: string;
  configured: boolean;
  objects: SpatialObjectSummary[];
  missing: string[];
  warnings: string[];
}

export interface SpatialSummaryOptions {
  requiredObjects?: string[];
  frameWidth?: number | null;
  frameHeight?: number | null;
  maxObjects?: number;
}

function clampNorm(value: number) {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function horizontalRegion(x: number): SpatialHorizontalRegion {
  if (x < 333) return "left";
  if (x > 667) return "right";
  return "center";
}

function verticalRegion(y: number): SpatialVerticalRegion {
  if (y < 333) return "top";
  if (y > 667) return "bottom";
  return "middle";
}

export function spatialPhrase(horizontal: SpatialHorizontalRegion, vertical: SpatialVerticalRegion) {
  if (horizontal === "center" && vertical === "middle") return "near the centre";
  if (horizontal === "center") return `${vertical} centre`;
  if (vertical === "middle") return `on the ${horizontal}`;
  return `${vertical}-${horizontal}`;
}

function normalizePixelPoint(value: number, extent: number | null | undefined) {
  if (!extent || extent <= 0) return null;
  return clampNorm((value / extent) * 1000);
}

function centroidFromBox(box: EntityBox, frameWidth?: number | null, frameHeight?: number | null) {
  const [a, b, c, d] = box.value;
  if (box.format === "er_yxyx_norm_1000") {
    return {
      x: clampNorm((b + d) / 2),
      y: clampNorm((a + c) / 2),
    };
  }
  const x = normalizePixelPoint((a + c) / 2, frameWidth);
  const y = normalizePixelPoint((b + d) / 2, frameHeight);
  return x === null || y === null ? null : { x, y };
}

function observationPoint(
  observation: EntityObservation,
  opts: Pick<SpatialSummaryOptions, "frameWidth" | "frameHeight">,
) {
  if (observation.centroid) {
    if (observation.centroid.coordinateFrame === "normalized_1000") {
      return {
        x: clampNorm(observation.centroid.x),
        y: clampNorm(observation.centroid.y),
      };
    }
    const x = normalizePixelPoint(observation.centroid.x, opts.frameWidth);
    const y = normalizePixelPoint(observation.centroid.y, opts.frameHeight);
    if (x !== null && y !== null) return { x, y };
  }
  return observation.box ? centroidFromBox(observation.box, opts.frameWidth, opts.frameHeight) : null;
}

function normalizeRequiredObjects(requiredObjects: string[] | undefined) {
  return [...new Set((requiredObjects || []).map((item) => item.trim()).filter(Boolean))];
}

function includesObject(label: string, objectName: string) {
  const haystack = label.toLowerCase();
  const needle = objectName.toLowerCase();
  return haystack.includes(needle) || needle.includes(haystack);
}

export function buildSpatialSummaryFromSegmentation(
  result: EntitySegmentationResult,
  opts: SpatialSummaryOptions = {},
): SpatialSummary {
  const maxObjects = Math.max(1, opts.maxObjects ?? 8);
  const objects: SpatialObjectSummary[] = result.observations
    .flatMap((observation): SpatialObjectSummary[] => {
      const point = observationPoint(observation, opts);
      if (!point) return [];
      const horizontal = horizontalRegion(point.x);
      const vertical = verticalRegion(point.y);
      return [{
        label: observation.label,
        confidence: Math.max(0, Math.min(1, Number(observation.confidence) || 0)),
        x: point.x,
        y: point.y,
        horizontal,
        vertical,
        phrase: spatialPhrase(horizontal, vertical),
        source: observation.source,
      }];
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxObjects);

  const required = normalizeRequiredObjects(opts.requiredObjects);
  const missing = required.filter((objectName) =>
    !objects.some((object) => includesObject(object.label, objectName)),
  );

  return {
    generatedAtMs: Date.now(),
    provider: result.provider,
    configured: result.configured,
    objects,
    missing,
    warnings: result.warnings,
  };
}

export function findSpatialSummaryInEvidence(
  evidence: MultiscaleEvidence[],
  opts: SpatialSummaryOptions = {},
): SpatialSummary | null {
  const segmentationEvidence = evidence
    .filter((item) => item.modeId === "entity-segmentation" && item.ok && item.parsed)
    .at(-1);
  if (!segmentationEvidence) return null;
  const parsed = segmentationEvidence.parsed as EntitySegmentationResult;
  if (!Array.isArray(parsed?.observations)) return null;
  return buildSpatialSummaryFromSegmentation(parsed, opts);
}

export function formatSpatialSummaryForVoice(summary: SpatialSummary | null) {
  if (!summary) {
    return "Spatial context: no grounded entity positions available yet.";
  }
  const objectText = summary.objects.length
    ? summary.objects
        .map((object) => `${object.label}: ${object.phrase} (x=${object.x}, y=${object.y}, ${Math.round(object.confidence * 100)}%)`)
        .join("; ")
    : "none localized";
  const missingText = summary.missing.length ? summary.missing.join(", ") : "none";
  const caveat = summary.configured
    ? "Use these positions for grounded directional wording when helpful."
    : "This is mock or unconfigured spatial evidence; phrase it cautiously and ask for a better view if uncertain.";
  return [
    `Spatial context (${summary.provider}): ${objectText}.`,
    `Missing required objects: ${missingText}.`,
    caveat,
  ].join("\n");
}
