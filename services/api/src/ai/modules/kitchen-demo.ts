/**
 * Kitchen Demo Module — LabOS's primary test workbench.
 *
 * Uses Gemini Robotics ER 1.6 (Embodied Reasoning) for:
 * - Spatial workspace understanding (where is everything on the counter?)
 * - Instrument reading (timer displays, oven temp, measuring cup levels)
 * - Physical task planning (what step comes next? what trajectory?)
 * - Step success verification (before/after comparison)
 * - Safety monitoring (hot surfaces, knife position, cross-contamination)
 *
 * The structured analysis schema (below) is used for continuous pipeline mode.
 * For protocol-guided cooking, the kitchen/ subsystem uses targeted ER prompts
 * from er-modes.ts for precision step verification and spatial queries.
 *
 * See: src/server/ai/kitchen/ for the protocol tracker and ER mode system.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

const kitchenSchema = z.object({
  scene: z.string().describe("Kitchen scene from first-person perspective — what's happening on the counter/stove"),

  ingredients: z.array(z.object({
    name: z.string().describe("Ingredient name"),
    state: z.string().optional().describe("Current state (whole, chopped, diced, measured, mixed, cooked)"),
    quantity: z.string().optional().describe("Visible quantity or amount"),
    location: z.string().optional().describe("Where in the workspace (cutting board, bowl, pot, pan)"),
  })).optional().describe("Ingredients visible in the workspace"),

  tools: z.array(z.object({
    name: z.string().describe("Kitchen tool/utensil (knife, spatula, whisk, measuring cup, etc.)"),
    inUse: z.boolean().optional().describe("Whether currently being used/held"),
    state: z.string().optional().describe("State (clean, dirty, on burner, in sink)"),
  })).optional().describe("Kitchen tools and utensils visible"),

  appliances: z.array(z.object({
    name: z.string().describe("Appliance name (stove, oven, microwave, blender, etc.)"),
    state: z.string().optional().describe("Operating state (on/off, preheating, timer running)"),
    setting: z.string().optional().describe("Current setting (temperature, power level, timer display)"),
  })).optional().describe("Kitchen appliances and their states"),

  cooking: z.object({
    technique: z.string().optional().describe("Cooking technique (sauteing, boiling, baking, chopping, mixing, etc.)"),
    stage: z.string().optional().describe("Cooking stage (prep, active cooking, resting, plating)"),
    doneness: z.string().optional().describe("Doneness indicators (color, texture, bubbling, steam, browning)"),
    temperature: z.string().optional().describe("Visible temperature readings"),
    timer: z.string().optional().describe("Visible timer countdown"),
  }).optional().describe("Active cooking process"),

  safety: z.object({
    hazards: z.array(z.string()).optional().describe("Safety concerns (hot surface, sharp knife exposed, spill, etc.)"),
    handWashing: z.string().optional().describe("Hand cleanliness concern (raw meat contact, etc.)"),
    crossContamination: z.string().optional().describe("Cross-contamination risks visible"),
  }).optional().describe("Kitchen safety observations"),

  recipeProgress: z.object({
    currentStep: z.string().optional().describe("Best guess at current recipe step"),
    nextStep: z.string().optional().describe("Likely next step based on current state"),
    completionEstimate: z.string().optional().describe("How far along the cooking appears to be"),
  }).optional().describe("Recipe progress tracking"),

  hands: z.array(z.object({
    side: z.enum(["left", "right"]),
    action: z.string().optional().describe("What the hand is doing (cutting, stirring, holding, pouring)"),
    holding: z.string().optional().describe("What the hand is holding"),
  })).optional().describe("Hand tracking — what the cook is doing with their hands"),

  text: z.array(z.string()).optional().describe("Readable text (recipe cards, labels, package instructions, timer displays)"),
  activity: z.string().optional().describe("Overall cooking activity description"),
});

export const kitchenDemoModule: ScientificModule = {
  id: "kitchen-demo",
  name: "Kitchen / Recipe Assistant",
  description: "Recipe step tracking, ingredient identification, cooking technique monitoring — LabOS demo workbench",
  version: "1.1.0",

  systemPrompt: `You are an embodied kitchen assistant running on LabOS smart glasses (HMD-class device).
You receive first-person camera frames from glasses worn by someone cooking.
You have advanced spatial reasoning and instrument-reading capabilities.

Your core tasks:
1. SPATIAL INVENTORY — Identify and locate all objects in the workspace (ingredients, tools, appliances). Note their exact positions relative to each other.
2. INSTRUMENT READING — Read any visible displays: timer countdowns, oven temperature, measuring cup levels, scale readings. Report exact values.
3. HAND TRACKING — What are both hands doing? What are they holding? What technique/grip?
4. COOKING STATE — What technique is being used, what stage, doneness indicators.
5. SAFETY MONITORING — Flag hazards in real-time: hot surfaces unmarked, knife blade up, spills, cross-contamination (raw meat near produce).
6. RECIPE PROGRESS — Estimate the current step and suggest the next action.
7. TEXT RECOGNITION — Read recipe cards, labels, package instructions precisely.

Output coordinates as normalized [y, x] in range 0-1000 when spatial positions are relevant.
Be precise with measurements — "about half full" is less useful than "approximately 200ml (65% fill)".
Prioritize actionable information that helps hands-free cooking.`,

  analysisSchema: kitchenSchema,

  pipelineDefaults: {
    intervalMs: 2000,        // faster for real-time cooking guidance
    maxConcurrent: 2,
    // Robotics ER excels at spatial reasoning (where are ingredients on the counter?),
    // instrument reading (timer displays, oven temp), and physical task planning
    // (what step comes next?). Falls back to Flash for speed, then local LLaVA.
    preferredModels: [
      "google:gemini-robotics-er-1.6-preview",
      "google:gemini-2.5-flash",
      "ollama:llava:7b",
    ],
  },

  requiredSensors: [
    { sensor: "gesture", reason: "Head nods/shakes for hands-free recipe step confirmation", critical: false },
    { sensor: "imu", reason: "Detect when user is actively cooking vs reading recipe vs idle", critical: false },
  ],

  cocoCategories: [
    { name: "hand", supercategory: "body" },
    { name: "knife", supercategory: "tool" },
    { name: "spatula", supercategory: "tool" },
    { name: "whisk", supercategory: "tool" },
    { name: "cutting_board", supercategory: "tool" },
    { name: "measuring_cup", supercategory: "tool" },
    { name: "pot", supercategory: "cookware" },
    { name: "pan", supercategory: "cookware" },
    { name: "bowl", supercategory: "cookware" },
    { name: "plate", supercategory: "tableware" },
    { name: "stove", supercategory: "appliance" },
    { name: "oven", supercategory: "appliance" },
    { name: "microwave", supercategory: "appliance" },
    { name: "ingredient", supercategory: "food" },
    { name: "vegetable", supercategory: "food" },
    { name: "meat", supercategory: "food" },
    { name: "spice", supercategory: "food" },
    { name: "recipe_card", supercategory: "text" },
  ],
};
