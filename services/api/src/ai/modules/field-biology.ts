/**
 * Field Biology Module — species ID, behavior annotation, habitat classification.
 *
 * For outdoor field work: species identification, population counts,
 * behavioral ethograms, and habitat characterization. IMU data tracks
 * movement patterns for transect walks and scanning behavior.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const fieldBiologySchema = z.object({
  scene: z.string().describe("Field scene description — habitat, conditions, time of day"),

  organisms: z.array(z.object({
    taxon: z.string().describe("Taxonomic group (bird, mammal, insect, plant, fungus, etc.)"),
    species: z.string().optional().describe("Species name (common or scientific) if identifiable"),
    count: z.number().optional().describe("Number of individuals visible"),
    behavior: z.string().optional().describe("Current behavior (foraging, resting, flying, calling, etc.)"),
    lifeStage: z.string().optional().describe("Life stage (adult, juvenile, larva, seedling, flowering, etc.)"),
    confidence: z.number().min(0).max(1).optional().describe("Identification confidence"),
  })).optional().describe("Organisms visible in the field"),

  habitat: z.object({
    type: z.string().describe("Habitat type (forest, grassland, wetland, urban, coastal, etc.)"),
    vegetation: z.string().optional().describe("Dominant vegetation (canopy, shrub layer, ground cover)"),
    terrain: z.string().optional().describe("Terrain features (slope, elevation clues, soil type)"),
    water: z.string().optional().describe("Water features (stream, pond, soil moisture)"),
    weather: z.string().optional().describe("Current conditions (sunny, overcast, rain, wind)"),
  }).describe("Habitat characterization"),

  interactions: z.array(z.object({
    type: z.string().describe("Interaction type (predation, pollination, competition, mutualism, parasitism)"),
    species1: z.string().describe("First species involved"),
    species2: z.string().describe("Second species involved"),
    description: z.string().optional().describe("Brief interaction description"),
  })).optional().describe("Ecological interactions observed"),

  signs: z.array(z.object({
    type: z.string().describe("Sign type (track, scat, burrow, nest, feeding sign, trail, web)"),
    species: z.string().optional().describe("Species likely responsible"),
    freshness: z.string().optional().describe("Age/freshness estimate"),
  })).optional().describe("Animal signs and traces"),

  activity: z.string().optional().describe("What the researcher is doing (surveying, photographing, collecting, etc.)"),
  equipment: z.array(z.string()).optional().describe("Field equipment visible (binoculars, net, GPS, etc.)"),
});

export const fieldBiologyModule: ScientificModule = {
  id: "field-biology",
  name: "Field Biology",
  description: "Species identification, behavior annotation, habitat classification, and ecological interaction tracking",
  version: "1.1.0",

  systemPrompt: `You are a field biology analysis system for LabOS smart glasses.
You receive first-person camera frames from glasses worn by a field researcher.

Focus on:
- Organisms: identify species (common names acceptable), count individuals, note behavior and life stage
- Habitat: classify the environment, describe vegetation layers, terrain, water features
- Interactions: flag any ecological interactions (predation, pollination, competition, etc.)
- Signs: identify animal tracks, scat, nests, burrows, feeding signs
- Conditions: note weather, light conditions, season indicators

Accuracy of species ID is important but uncertainty is acceptable — use confidence scores.
Note behavior using standard ethological terms when possible.`,

  analysisSchema: fieldBiologySchema,

  pipelineDefaults: {
    intervalMs: 5000,
    maxConcurrent: 2,
    // Robotics ER for spatial habitat understanding, organism localization,
    // and physical sign interpretation (tracks, nests). Flash for speed, LLaVA for offline.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-flash",
      "ollama:llava:13b",
    ],
  },

  requiredSensors: [
    { sensor: "imu", reason: "Motion tracking for transect walks — walking speed and head scanning patterns indicate survey method", critical: false },
  ],

  cocoCategories: [
    { name: "bird", supercategory: "animal" },
    { name: "mammal", supercategory: "animal" },
    { name: "insect", supercategory: "animal" },
    { name: "reptile", supercategory: "animal" },
    { name: "amphibian", supercategory: "animal" },
    { name: "fish", supercategory: "animal" },
    { name: "plant", supercategory: "flora" },
    { name: "fungus", supercategory: "flora" },
    { name: "nest", supercategory: "sign" },
    { name: "track", supercategory: "sign" },
    { name: "scat", supercategory: "sign" },
  ],
};
