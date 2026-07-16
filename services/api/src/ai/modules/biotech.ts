/**
 * Biotech / Lab Safety Module — cell cultures, reagents, equipment, PPE compliance.
 *
 * Designed for wet lab environments: monitors protocol compliance, identifies
 * reagents and equipment, tracks safety gear usage, and detects contamination risks.
 * IMU data detects hand steadiness during micropipetting and microscopy.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const biotechSchema = z.object({
  scene: z.string().describe("Lab scene description from first-person perspective"),

  cellCultures: z.array(z.object({
    type: z.string().describe("Cell type or culture vessel (e.g., T-75 flask, petri dish, well plate)"),
    confluency: z.string().optional().describe("Estimated confluency (e.g., 80%, sparse, overconfluent)"),
    morphology: z.string().optional().describe("Cell appearance (e.g., adherent, suspension, rounded, elongated)"),
    contamination: z.string().optional().describe("Signs of contamination (e.g., cloudiness, color change, debris)"),
  })).optional().describe("Cell cultures visible in frame"),

  equipment: z.array(z.object({
    name: z.string().describe("Equipment name (e.g., micropipette, centrifuge, PCR machine, incubator)"),
    state: z.string().optional().describe("Operating state (on/off, running, lid open, etc.)"),
    readings: z.string().optional().describe("Visible display readings (temperature, RPM, time, etc.)"),
  })).optional().describe("Lab equipment visible"),

  reagents: z.array(z.object({
    label: z.string().describe("Reagent name or label text"),
    container: z.string().optional().describe("Container type (bottle, tube, vial, etc.)"),
    volume: z.string().optional().describe("Approximate volume level if visible"),
    hazard: z.string().optional().describe("Hazard symbols or warnings visible"),
  })).optional().describe("Reagent bottles/containers visible"),

  safety: z.object({
    ppe: z.array(z.string()).describe("PPE worn or visible (gloves, goggles, lab coat, face shield, etc.)"),
    hazards: z.array(z.string()).optional().describe("Active hazards (open flame, chemical spill, sharps, etc.)"),
    compliance: z.boolean().optional().describe("Whether proper PPE appears to be in use for the current activity"),
    violations: z.array(z.string()).optional().describe("Specific safety violations observed"),
  }).describe("Safety assessment"),

  protocol: z.object({
    step: z.string().optional().describe("Current protocol step being performed"),
    technique: z.string().optional().describe("Technique being used (aseptic, sterile, PCR prep, etc.)"),
    deviation: z.string().optional().describe("Any deviation from standard technique"),
  }).optional().describe("Protocol tracking"),

  activity: z.string().optional().describe("Lab activity being performed"),
  environment: z.string().optional().describe("Lab type: BSL-2, clean room, general bench, fume hood, etc."),
});

export const biotechModule: ScientificModule = {
  id: "biotech",
  name: "Biotech / Lab Safety",
  description: "Cell cultures, reagents, lab equipment identification, PPE compliance monitoring, and protocol tracking",
  version: "1.1.0",

  systemPrompt: `You are a biotech lab analysis system for LabOS smart glasses.
You receive first-person camera frames from glasses worn by a lab researcher.
Analyze the lab environment with a focus on:

- Cell cultures: identify vessels, estimate confluency, flag contamination signs
- Equipment: identify instruments, read displays, note operating states
- Reagents: read labels, identify containers, note hazard symbols
- Safety: catalog PPE in use, identify hazards, assess protocol compliance
- Protocol: determine what step/technique is being performed

This data feeds into lab safety monitoring and electronic lab notebook systems.
Be precise with equipment names and reagent labels. Flag any safety concerns prominently.`,

  analysisSchema: biotechSchema,

  pipelineDefaults: {
    intervalMs: 5000,
    maxConcurrent: 1,
    // Robotics ER for spatial reasoning (lab bench layout, equipment positions),
    // instrument reading (centrifuge displays, incubator temp), and PPE compliance.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-flash",
    ],
  },

  requiredSensors: [
    { sensor: "imu", reason: "Hand steadiness detection during micropipetting and microscopy", critical: false },
  ],

  cocoCategories: [
    { name: "cell_culture", supercategory: "biology" },
    { name: "petri_dish", supercategory: "labware" },
    { name: "well_plate", supercategory: "labware" },
    { name: "micropipette", supercategory: "equipment" },
    { name: "centrifuge", supercategory: "equipment" },
    { name: "microscope", supercategory: "equipment" },
    { name: "pcr_machine", supercategory: "equipment" },
    { name: "incubator", supercategory: "equipment" },
    { name: "fume_hood", supercategory: "equipment" },
    { name: "reagent_bottle", supercategory: "consumable" },
    { name: "tube", supercategory: "consumable" },
    { name: "gloves", supercategory: "ppe" },
    { name: "safety_goggles", supercategory: "ppe" },
    { name: "lab_coat", supercategory: "ppe" },
    { name: "face_shield", supercategory: "ppe" },
    { name: "hand", supercategory: "body" },
  ],
};
