/**
 * Scientific Module Type Definitions — the interface every domain module implements.
 *
 * Each module provides domain-specific VLM configuration: prompts, output schemas,
 * COCO categories, sensor requirements, and processing hooks. The pipeline uses
 * whichever module the user selects to drive the entire analysis flow.
 *
 * This is what makes LabOS a multi-domain scientific instrument platform rather
 * than just a generic frame analyzer.
 */

import type { z } from "zod";

export interface ScientificModule {
  /** Unique identifier, e.g., "general", "biotech", "nanotech" */
  id: string;

  /** Human-readable name, e.g., "Biotech / Lab Safety" */
  name: string;

  /** Short description of what this module analyzes */
  description: string;

  /** Semver for tracking which module version produced an annotation */
  version: string;

  // ── VLM Configuration ───────────────────────────────

  /** Domain-specific system prompt — tells the VLM what to focus on */
  systemPrompt: string;

  /** Zod schema for structured output via generateObject() */
  analysisSchema: z.ZodType<any>;

  /**
   * Optional user prompt override. If not set, the default
   * "Analyze this egocentric camera frame" prompt is used.
   */
  userPrompt?: string;

  // ── Pipeline Defaults ───────────────────────────────

  pipelineDefaults: {
    intervalMs: number;
    maxConcurrent: number;
    /** Suggested models for this domain, e.g., ["google:gemini-2.5-flash"] */
    preferredModels?: string[];
  };

  // ── Sensor Requirements ─────────────────────────────

  /** Which sensors this module needs, with reasons (for UI display and warnings) */
  requiredSensors?: SensorRequirement[];

  // ── Processing Hooks ────────────────────────────────

  /** Pre-process frame buffer before sending to VLM (e.g., contrast enhancement) */
  preprocessFrame?: (buffer: Buffer) => Promise<Buffer>;

  /** Post-process the VLM's structured output (e.g., unit conversions, derived fields) */
  postprocessResult?: (result: any) => any;

  // ── Export Configuration ────────────────────────────

  /** COCO object detection categories for this domain */
  cocoCategories?: CocoCategoryDef[];

  /** Extra metadata fields added to COCO/JSONL exports */
  exportMetadata?: Record<string, any>;
}

export interface SensorRequirement {
  sensor: "imu" | "gesture" | "battery";
  reason: string;
  /** If true, UI warns when this sensor is unavailable */
  critical: boolean;
}

export interface CocoCategoryDef {
  name: string;
  supercategory: string;
}

/** Serializable module info for API responses (strips functions and Zod schemas) */
export interface ScientificModuleInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  pipelineDefaults: ScientificModule["pipelineDefaults"];
  requiredSensors?: SensorRequirement[];
  cocoCategories?: CocoCategoryDef[];
  /** Human-readable description of the analysis schema fields */
  schemaFields?: string[];
}
