/**
 * Materials Science Module — crystal structures, phase analysis, grain boundaries, stress patterns.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const materialsSchema = z.object({
  scene: z.string().describe("Materials sample or instrument view description"),

  phases: z.array(z.object({
    name: z.string().describe("Phase name or designation (e.g., austenite, ferrite, martensite, amorphous)"),
    fraction: z.string().optional().describe("Estimated volume fraction or area percentage"),
    morphology: z.string().optional().describe("Phase morphology (equiaxed, lamellar, dendritic, etc.)"),
    color: z.string().optional().describe("Appearance in the current imaging mode"),
  })).optional().describe("Phases identified in the microstructure"),

  grains: z.object({
    averageSize: z.string().optional().describe("Average grain size estimate"),
    sizeDistribution: z.string().optional().describe("Qualitative size distribution (uniform, bimodal, etc.)"),
    shape: z.string().optional().describe("Grain shape (equiaxed, elongated, columnar)"),
    boundaries: z.string().optional().describe("Grain boundary characteristics (clean, decorated, serrated)"),
  }).optional().describe("Grain structure analysis"),

  defects: z.array(z.object({
    type: z.string().describe("Defect type (void, inclusion, crack, porosity, precipitate, twin)"),
    location: z.string().optional().describe("Location in field of view"),
    severity: z.string().optional().describe("Impact assessment"),
  })).optional().describe("Defects and discontinuities"),

  stressIndicators: z.array(z.string()).optional()
    .describe("Evidence of stress or deformation (slip lines, deformation bands, twins, texture)"),

  composition: z.object({
    elements: z.array(z.string()).optional().describe("Elements identified or expected"),
    technique: z.string().optional().describe("Composition analysis technique visible (EDS, WDS, XRF)"),
    spectra: z.string().optional().describe("Description of any visible spectra or maps"),
  }).optional().describe("Composition information"),

  processing: z.string().optional().describe("Evident processing history (cast, wrought, sintered, printed, etc.)"),
  activity: z.string().optional().describe("What the researcher is doing"),
  instrument: z.string().optional().describe("Instrument/technique being used"),
});

export const materialsModule: ScientificModule = {
  id: "materials",
  name: "Materials Science",
  description: "Crystal structures, phase identification, grain analysis, defect detection, and stress patterns",
  version: "1.1.0",

  systemPrompt: `You are a materials science analysis system for LabOS smart glasses.
You receive first-person camera frames showing material samples, microstructures,
or instrument displays from materials characterization work.

Focus on:
- Phases: identify crystal phases, estimate fractions, describe morphology
- Grains: assess size, distribution, shape, boundary characteristics
- Defects: flag voids, inclusions, cracks, porosity, precipitates
- Stress indicators: look for slip lines, deformation bands, twins
- Composition: note any EDS/XRF data, elemental maps, or spectral info
- Processing: infer processing history from microstructural features

Be precise with phase identification and grain size estimates.
Reference scale bars when visible. Note the imaging technique being used.`,

  analysisSchema: materialsSchema,

  pipelineDefaults: {
    intervalMs: 5000,
    maxConcurrent: 1,
    // Robotics ER for spatial reasoning about crystal structures, phase boundaries,
    // and grain morphology — physical-world understanding at the microstructure level.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-flash",
    ],
  },

  cocoCategories: [
    { name: "grain", supercategory: "microstructure" },
    { name: "grain_boundary", supercategory: "microstructure" },
    { name: "void", supercategory: "defect" },
    { name: "inclusion", supercategory: "defect" },
    { name: "crack", supercategory: "defect" },
    { name: "precipitate", supercategory: "microstructure" },
    { name: "twin", supercategory: "microstructure" },
    { name: "porosity", supercategory: "defect" },
    { name: "scale_bar", supercategory: "annotation" },
  ],
};
