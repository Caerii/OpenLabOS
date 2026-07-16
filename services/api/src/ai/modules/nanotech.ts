/**
 * Nanotech / Microscopy Module — nanostructures, SEM/TEM interpretation, defect detection.
 *
 * Analyzes microscopy views through smart glasses: identifies nanostructures,
 * measures features, detects defects, and monitors mechanical stability
 * via accelerometer vibration levels.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const nanotechSchema = z.object({
  scene: z.string().describe("Microscopy scene description — what's visible through the eyepiece or on screen"),

  structures: z.array(z.object({
    type: z.string().describe("Structure type (nanoparticle, nanotube, nanowire, thin film, quantum dot, etc.)"),
    morphology: z.string().optional().describe("Shape and form (spherical, rod-like, dendritic, layered, etc.)"),
    dimensions: z.string().optional().describe("Approximate size/dimensions if scale bar visible"),
    distribution: z.string().optional().describe("Spatial distribution (uniform, clustered, sparse, aligned)"),
  })).optional().describe("Nanostructures visible in the microscopy field"),

  defects: z.array(z.object({
    type: z.string().describe("Defect type (vacancy, dislocation, crack, contamination, agglomeration)"),
    location: z.string().optional().describe("Where in the field of view"),
    severity: z.string().optional().describe("Low/medium/high impact on sample quality"),
  })).optional().describe("Defects or anomalies detected"),

  measurements: z.array(z.object({
    label: z.string().describe("What is being measured"),
    value: z.string().describe("Measured value with units"),
    method: z.string().optional().describe("Measurement method (scale bar, calibration, etc.)"),
  })).optional().describe("Measurements visible (scale bars, readouts, etc.)"),

  surfaceAnalysis: z.object({
    roughness: z.string().optional().describe("Surface roughness qualitative assessment"),
    coverage: z.string().optional().describe("Surface coverage percentage or qualitative"),
    uniformity: z.string().optional().describe("Coating/deposition uniformity"),
  }).optional().describe("Surface characterization"),

  stability: z.object({
    vibrationLevel: z.string().optional().describe("Environmental vibration assessment (low/medium/high)"),
    isStable: z.boolean().optional().describe("Whether conditions are stable enough for imaging"),
    driftDetected: z.boolean().optional().describe("Whether sample/stage drift is visible"),
  }).optional().describe("Imaging stability assessment"),

  instrument: z.object({
    type: z.string().optional().describe("Instrument type (SEM, TEM, AFM, optical microscope, etc.)"),
    magnification: z.string().optional().describe("Current magnification if visible"),
    mode: z.string().optional().describe("Imaging mode (SE, BSE, bright field, dark field, etc.)"),
  }).optional().describe("Instrument information"),

  activity: z.string().optional().describe("What the operator is doing (imaging, focusing, measuring, etc.)"),
});

export const nanotechModule: ScientificModule = {
  id: "nanotech",
  name: "Nanotech / Microscopy",
  description: "Nanostructure identification, SEM/TEM analysis, surface morphology, defect detection, and stability monitoring",
  version: "1.1.0",

  systemPrompt: `You are a nanoscale analysis system for LabOS smart glasses.
You receive first-person camera frames showing microscopy views — either through eyepieces
or on instrument displays/screens.

Analyze with a focus on:
- Nanostructures: identify types, morphology, size estimates (use scale bars when visible)
- Defects: flag vacancies, cracks, contamination, agglomeration
- Measurements: read scale bars, instrument readouts, dimension markers
- Surface analysis: roughness, coverage, uniformity assessment
- Stability: note any drift, vibration artifacts, or focus issues
- Instrument: identify the microscope type, magnification, imaging mode

This data feeds into materials characterization databases and quality control systems.
Be precise with structure identification and measurements. Reference scale bars when visible.`,

  analysisSchema: nanotechSchema,

  pipelineDefaults: {
    intervalMs: 5000,
    maxConcurrent: 1,
    // Robotics ER for spatial/structural understanding of nanostructures and
    // instrument reading (SEM/TEM controls, magnification settings). Pro as fallback
    // for detailed analysis when ER isn't available.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-pro",
    ],
  },

  requiredSensors: [
    { sensor: "imu", reason: "Vibration monitoring — accelerometer noise floor indicates mechanical stability of the imaging platform", critical: true },
  ],

  cocoCategories: [
    { name: "nanoparticle", supercategory: "structure" },
    { name: "nanotube", supercategory: "structure" },
    { name: "nanowire", supercategory: "structure" },
    { name: "thin_film", supercategory: "structure" },
    { name: "surface_defect", supercategory: "defect" },
    { name: "grain_boundary", supercategory: "structure" },
    { name: "crack", supercategory: "defect" },
    { name: "contamination", supercategory: "defect" },
    { name: "scale_bar", supercategory: "annotation" },
    { name: "instrument_display", supercategory: "equipment" },
  ],
};
