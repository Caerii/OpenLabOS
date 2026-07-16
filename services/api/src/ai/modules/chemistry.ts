/**
 * Chemistry Module — reaction monitoring, color changes, glassware, safety assessment.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const chemistrySchema = z.object({
  scene: z.string().describe("Chemistry lab scene from first-person perspective"),

  reaction: z.object({
    stage: z.string().optional().describe("Reaction stage (setup, in progress, complete, quenching)"),
    color: z.string().optional().describe("Solution/mixture color and any color changes"),
    clarity: z.string().optional().describe("Clear, turbid, opaque, layered, etc."),
    precipitate: z.string().optional().describe("Precipitate description if present (color, texture, amount)"),
    gasEvolution: z.boolean().optional().describe("Whether gas bubbles are visible"),
    temperature: z.string().optional().describe("Temperature if visible on thermometer/display"),
    stirring: z.boolean().optional().describe("Whether stirring is active"),
  }).optional().describe("Reaction state monitoring"),

  glassware: z.array(z.object({
    type: z.string().describe("Glassware type (beaker, flask, burette, condenser, round-bottom, etc.)"),
    contents: z.string().optional().describe("What's inside (liquid color, volume level)"),
    volume: z.string().optional().describe("Graduated reading or estimated volume"),
    setup: z.string().optional().describe("How it's configured (on hotplate, in ice bath, clamped, etc.)"),
  })).optional().describe("Glassware and containers visible"),

  indicators: z.array(z.object({
    name: z.string().describe("Indicator name if identifiable (phenolphthalein, litmus, universal, etc.)"),
    color: z.string().describe("Current indicator color"),
    meaning: z.string().optional().describe("What the color indicates (pH range, endpoint, etc.)"),
  })).optional().describe("Chemical indicators visible"),

  instruments: z.array(z.object({
    name: z.string().describe("Instrument name (balance, pH meter, spectrophotometer, etc.)"),
    reading: z.string().optional().describe("Current display reading"),
  })).optional().describe("Instruments and their readings"),

  safety: z.object({
    ventilation: z.string().optional().describe("Fume hood status (open/closed, sash height)"),
    ppe: z.array(z.string()).optional().describe("PPE visible (gloves, goggles, etc.)"),
    hazards: z.array(z.string()).optional().describe("Active hazards (open flame, corrosives, etc.)"),
  }).optional().describe("Safety assessment"),

  activity: z.string().optional().describe("What the chemist is doing"),
  technique: z.string().optional().describe("Technique being performed (titration, distillation, extraction, etc.)"),
});

export const chemistryModule: ScientificModule = {
  id: "chemistry",
  name: "Chemistry / Reaction Monitoring",
  description: "Reaction monitoring, color change detection, glassware identification, and safety assessment",
  version: "1.1.0",

  systemPrompt: `You are a chemistry lab analysis system for LabOS smart glasses.
You receive first-person camera frames from glasses worn by a chemist.

Focus on:
- Reaction state: color, clarity, precipitates, gas evolution, temperature
- Glassware: identify types, read volumes, note configurations
- Indicators: identify indicator colors and their chemical meaning
- Instruments: read displays (pH, mass, absorbance, temperature)
- Safety: fume hood status, PPE, active hazards
- Technique: determine what procedure is being performed

Accurate color description is critical for reaction monitoring.
Read all visible numeric displays and graduated markings precisely.`,

  analysisSchema: chemistrySchema,

  pipelineDefaults: {
    intervalMs: 3000,
    maxConcurrent: 1,
    // Robotics ER's instrument reading capability is critical for chemistry:
    // reading thermometers, graduated cylinders, pH meters, balance displays.
    // Its spatial reasoning also helps with glassware setup understanding.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-flash",
    ],
  },

  cocoCategories: [
    { name: "beaker", supercategory: "glassware" },
    { name: "flask", supercategory: "glassware" },
    { name: "burette", supercategory: "glassware" },
    { name: "condenser", supercategory: "glassware" },
    { name: "test_tube", supercategory: "glassware" },
    { name: "round_bottom_flask", supercategory: "glassware" },
    { name: "hotplate", supercategory: "equipment" },
    { name: "balance", supercategory: "equipment" },
    { name: "ph_meter", supercategory: "equipment" },
    { name: "fume_hood", supercategory: "equipment" },
    { name: "precipitate", supercategory: "reaction" },
    { name: "reagent_bottle", supercategory: "consumable" },
    { name: "gloves", supercategory: "ppe" },
    { name: "safety_goggles", supercategory: "ppe" },
  ],
};
