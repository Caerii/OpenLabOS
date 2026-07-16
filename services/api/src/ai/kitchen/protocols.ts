/**
 * Kitchen Protocol Definitions — Step-by-step recipes with ER verification.
 *
 * Each protocol defines:
 * - Ordered steps with human-readable instructions
 * - Success criteria (what ER should look for to confirm completion)
 * - Required objects per step (for spatial inventory)
 * - Verification prompts tailored to Gemini Robotics ER 1.6
 * - Hazard checks per step (safety monitoring)
 *
 * Protocols are designed to be simple enough to demo in any kitchen,
 * but structured enough to test the full ER capability stack.
 */

import path from "path";
import { fileURLToPath } from "url";

import { createProtocolStore } from "./protocol-store.js";
import { RICH_RECIPE_PROTOCOLS } from "./recipe-protocols.js";
import type { KitchenProtocol } from "./protocol-types.js";
export type { KitchenProtocol, ProtocolStep } from "./protocol-types.js";

// ── Protocol: Make a Cup of Tea ─────────────────────────

export const TEA_PROTOCOL: KitchenProtocol = {
  id: "kitchen-tea-v1",
  name: "Make a Cup of Tea",
  description: "Simple 6-step tea preparation with a captured setup step - the foundational LabOS demo protocol. Tests object tracking, liquid level detection, and step verification.",
  difficulty: "beginner",
  estimatedMinutes: 5,
  tags: ["hot-beverage", "beginner", "liquid-level", "timing"],

  requiredInventory: [
    { name: "mug", category: "tool" },
    { name: "kettle", category: "appliance" },
    { name: "tea bag", category: "ingredient" },
    { name: "spoon", category: "tool" },
    { name: "tray", category: "tool" },
    { name: "water", category: "ingredient" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for making tea. I need: a mug, a kettle (or hot water source), a tea bag, a spoon, and a tray.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Set up the workspace with the mug, hot water source, tea bag, spoon, tray, and clear counter visible",
      successCriteria: "All required tea-making items are visible and reachable in the workspace, with enough clear counter space for the task",
      verificationPrompt: `Check whether the tea workspace is ready before the operator starts making tea.
Required items: mug, kettle or hot water source, tea bag, spoon, tray, and clear counter space.

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "visible_items": ["<items visible>"], "missing_items": ["<items missing>"], "reasoning": "brief explanation"}`,
      requiredObjects: ["mug", "kettle", "tea bag", "spoon", "tray", "counter"],
      spatialHint: "All required items should be visible, reachable, and not blocking the central workspace",
      hazardChecks: ["Hot water source should be stable and away from the counter edge"],
      expectedDurationSec: 10,
    },
    {
      number: 2,
      instruction: "Place the mug on the counter in your workspace",
      successCriteria: "Mug is visible on a flat counter surface, upright, empty",
      verificationPrompt: `Look at the workspace. Is there an empty mug placed upright on the counter?
Answer with JSON: {"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "mug_location": [y, x]}
The coordinates are in [y, x] format normalized to 0-1000.`,
      requiredObjects: ["mug", "counter"],
      spatialHint: "Mug should be in the center of the workspace for easy access",
      expectedDurationSec: 5,
    },
    {
      number: 3,
      instruction: "Pour hot water into the mug (fill to about 80%)",
      successCriteria: "Mug contains water, approximately 80% full, kettle visible or recently used",
      verificationPrompt: `Analyze the mug. Has water been poured into it?
To verify:
1) Point to the top of the mug and the water level
2) Estimate the fill level as a percentage

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "fill_percent": <number>, "reasoning": "brief explanation"}`,
      requiredObjects: ["mug", "kettle"],
      spatialHint: "Kettle should be near the mug for pouring",
      hazardChecks: ["Hot water — ensure kettle is held steadily", "No splashing detected"],
      instrumentReads: ["kettle temperature display (if electric)"],
      expectedDurationSec: 15,
    },
    {
      number: 4,
      instruction: "Add a tea bag to the mug",
      successCriteria: "Tea bag visible inside the mug or its string hanging over the rim",
      verificationPrompt: `Look at the mug with water. Is there a tea bag inside it?
Look for: tea bag submerged in water, tea bag string/tag hanging over the rim, or color change in the water indicating steeping.

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "tea_bag_visible": true/false, "string_visible": true/false, "water_color_changed": true/false}`,
      requiredObjects: ["mug", "tea bag"],
      expectedDurationSec: 5,
    },
    {
      number: 5,
      instruction: "Stir the tea with a spoon (5-10 circular motions)",
      successCriteria: "Spoon is in or near the mug, water shows signs of stirring (swirl, darker color from steeping)",
      verificationPrompt: `Is the person stirring tea in the mug with a spoon?
Look for: spoon in hand or in mug, circular motion blur, water movement/swirl, tea color diffusing.

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "spoon_in_mug": true/false, "stirring_motion": true/false}`,
      requiredObjects: ["mug", "spoon"],
      spatialHint: "Spoon should be grasped and inserted into the mug",
      expectedDurationSec: 15,
    },
    {
      number: 6,
      instruction: "Place the mug on the tray",
      successCriteria: "Mug is positioned on the tray surface, stable, not at risk of tipping",
      verificationPrompt: `Has the mug been placed on the tray?
Verify: mug is on the tray surface (not the counter), upright, stable.

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "mug_on_tray": true/false, "stable": true/false}`,
      requiredObjects: ["mug", "tray"],
      spatialHint: "Mug should be centered on the tray for stability",
      expectedDurationSec: 5,
    },
  ],
};

// ── Protocol: Make Toast with Butter ────────────────────

export const TOAST_PROTOCOL: KitchenProtocol = {
  id: "kitchen-toast-v1",
  name: "Make Toast with Butter",
  description: "Toasting bread and buttering it — tests appliance interaction, temperature awareness, and spreading technique tracking.",
  difficulty: "beginner",
  estimatedMinutes: 5,
  tags: ["breakfast", "beginner", "appliance", "spreading"],

  requiredInventory: [
    { name: "bread", category: "ingredient" },
    { name: "butter", category: "ingredient" },
    { name: "toaster", category: "appliance" },
    { name: "plate", category: "tool" },
    { name: "butter knife", category: "tool" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for making toast with butter. I need: bread (sliced), butter, a toaster, a plate, and a butter knife.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Place a slice of bread into the toaster",
      successCriteria: "Bread slice is inserted into the toaster slot",
      verificationPrompt: `Is there a slice of bread in the toaster?
Answer with JSON: {"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
      requiredObjects: ["bread", "toaster"],
      expectedDurationSec: 5,
    },
    {
      number: 2,
      instruction: "Push the toaster lever down and wait for toast",
      successCriteria: "Toaster lever is engaged (down position) or toast has popped up golden-brown",
      verificationPrompt: `Check the toaster: is it actively toasting (lever down, heating) or has the toast popped up?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "toaster_active": true/false, "toast_done": true/false}`,
      requiredObjects: ["toaster"],
      hazardChecks: ["Toaster is hot — do not touch heating elements"],
      instrumentReads: ["toaster darkness dial setting"],
      expectedDurationSec: 120,
    },
    {
      number: 3,
      instruction: "Remove toast and place it on the plate",
      successCriteria: "Toasted bread is on the plate, golden-brown color",
      verificationPrompt: `Is there a piece of toast (browned bread) on the plate?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "toast_color": "pale|golden|dark|burnt"}`,
      requiredObjects: ["plate"],
      hazardChecks: ["Toast may be hot — use fingers carefully at edges"],
      expectedDurationSec: 5,
    },
    {
      number: 4,
      instruction: "Scoop butter with the knife",
      successCriteria: "Butter knife has a portion of butter on it",
      verificationPrompt: `Does the butter knife have butter on it, ready to spread?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
      requiredObjects: ["butter knife", "butter"],
      expectedDurationSec: 5,
    },
    {
      number: 5,
      instruction: "Spread butter evenly across the toast",
      successCriteria: "Toast has a visible layer of butter spread across its surface",
      verificationPrompt: `Has butter been spread on the toast? Look for a glossy/melted butter layer on the bread surface.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "coverage": "none|partial|full"}`,
      requiredObjects: ["plate", "butter knife"],
      spatialHint: "Spread from edge to edge with even pressure",
      expectedDurationSec: 15,
    },
  ],
};

// ── Protocol: Pour and Measure ──────────────────────────

export const MEASURE_POUR_PROTOCOL: KitchenProtocol = {
  id: "kitchen-measure-v1",
  name: "Precise Measurement & Pour",
  description: "Measuring liquids to exact volumes — tests instrument reading, liquid level detection, and precision motor guidance. Great for ER's gauge-reading capabilities.",
  difficulty: "intermediate",
  estimatedMinutes: 5,
  tags: ["measuring", "intermediate", "liquid-level", "precision", "instrument-reading"],

  requiredInventory: [
    { name: "measuring cup", category: "tool" },
    { name: "water bottle", category: "ingredient" },
    { name: "bowl", category: "tool" },
    { name: "food coloring", category: "ingredient" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for a measuring exercise. I need: a measuring cup (with visible measurement lines), a water bottle or pitcher, a bowl, and optionally food coloring.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Place the measuring cup on a flat surface",
      successCriteria: "Measuring cup is on the counter, empty, measurement markings visible",
      verificationPrompt: `Is there a measuring cup on a flat surface? Can you see its measurement markings?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation", "markings_visible": true/false}`,
      requiredObjects: ["measuring cup"],
      expectedDurationSec: 5,
    },
    {
      number: 2,
      instruction: "Pour water to the 1 cup (250ml) line",
      successCriteria: "Water level in the measuring cup is at or near the 1 cup / 250ml mark",
      verificationPrompt: `Read the measuring cup. What is the current water level?
To read it:
1) Find the points for the measurement markings and the water meniscus level
2) Determine which measurement line the water is closest to

Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reading_ml": <number>, "target_ml": 250, "accuracy_percent": <how close to target>, "reasoning": "brief explanation"}`,
      requiredObjects: ["measuring cup", "water bottle"],
      instrumentReads: ["measuring cup graduation marks"],
      spatialHint: "Pour slowly near the target line — eye level reading is most accurate",
      expectedDurationSec: 20,
    },
    {
      number: 3,
      instruction: "Add 2-3 drops of food coloring to the water",
      successCriteria: "Water in measuring cup has changed color from clear",
      verificationPrompt: `Has food coloring been added to the water? Look for color change.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "water_color": "<detected color>", "reasoning": "brief explanation"}`,
      requiredObjects: ["measuring cup", "food coloring"],
      hazardChecks: ["Food coloring stains — avoid contact with clothes/surfaces"],
      expectedDurationSec: 10,
    },
    {
      number: 4,
      instruction: "Pour the colored water from the measuring cup into the bowl",
      successCriteria: "Bowl contains colored water, measuring cup is empty or nearly empty",
      verificationPrompt: `Has the colored water been transferred from the measuring cup to the bowl?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "bowl_has_liquid": true/false, "cup_empty": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["measuring cup", "bowl"],
      spatialHint: "Pour steadily — measuring cup spout over the bowl center",
      expectedDurationSec: 10,
    },
    {
      number: 5,
      instruction: "Verify the bowl contains approximately 250ml by checking the measuring cup is empty",
      successCriteria: "Measuring cup is empty, bowl has all the colored liquid",
      verificationPrompt: `Final verification: Is the measuring cup empty and the bowl full of colored liquid?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "cup_residue": "none|drops|significant", "bowl_fill": "empty|partial|full", "reasoning": "brief explanation"}`,
      requiredObjects: ["measuring cup", "bowl"],
      expectedDurationSec: 5,
    },
  ],
};

// ── Protocol: Sandwich Assembly ─────────────────────────

export const SANDWICH_PROTOCOL: KitchenProtocol = {
  id: "kitchen-sandwich-v1",
  name: "Build a Simple Sandwich",
  description: "Multi-ingredient sandwich assembly — tests spatial planning, layering order, ingredient tracking, and workspace organization. Leverages ER's trajectory and spatial reasoning.",
  difficulty: "intermediate",
  estimatedMinutes: 8,
  tags: ["assembly", "intermediate", "spatial", "multi-ingredient", "trajectory"],

  requiredInventory: [
    { name: "bread", category: "ingredient" },
    { name: "cheese", category: "ingredient" },
    { name: "lettuce", category: "ingredient" },
    { name: "tomato", category: "ingredient" },
    { name: "knife", category: "tool" },
    { name: "cutting board", category: "tool" },
    { name: "plate", category: "tool" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for making a sandwich. I need: two slices of bread, cheese, lettuce, a tomato, a knife, a cutting board, and a plate.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Place two bread slices on the cutting board",
      successCriteria: "Two bread slices visible side by side on the cutting board",
      verificationPrompt: `Are there two slices of bread on the cutting board?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "bread_count": <number>, "reasoning": "brief explanation"}`,
      requiredObjects: ["bread", "cutting board"],
      expectedDurationSec: 5,
    },
    {
      number: 2,
      instruction: "Slice the tomato into rounds",
      successCriteria: "Tomato has been cut into slices on the cutting board",
      verificationPrompt: `Has the tomato been sliced? Look for tomato rounds/slices on the cutting board.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "slice_count": <approximate number>, "reasoning": "brief explanation"}`,
      requiredObjects: ["tomato", "knife", "cutting board"],
      hazardChecks: ["Sharp knife — proper grip with fingers curled back"],
      expectedDurationSec: 30,
    },
    {
      number: 3,
      instruction: "Layer cheese on one slice of bread",
      successCriteria: "Cheese slice or shredded cheese is on top of one bread slice",
      verificationPrompt: `Has cheese been placed on one of the bread slices?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
      requiredObjects: ["bread", "cheese"],
      expectedDurationSec: 5,
    },
    {
      number: 4,
      instruction: "Add tomato slices and lettuce on top of the cheese",
      successCriteria: "Tomato and lettuce layers are visible stacked on the cheese/bread",
      verificationPrompt: `Has tomato and lettuce been layered on top of the cheese and bread?
Look for the sandwich stack: bread → cheese → tomato → lettuce.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "layers_visible": ["bread", "cheese", "tomato", "lettuce"], "reasoning": "brief explanation"}`,
      requiredObjects: ["tomato", "lettuce"],
      spatialHint: "Layer from bottom: bread, cheese, tomato rounds, then lettuce leaf",
      expectedDurationSec: 15,
    },
    {
      number: 5,
      instruction: "Place the second bread slice on top and transfer to plate",
      successCriteria: "Complete sandwich on the plate — top bread visible, sandwich intact",
      verificationPrompt: `Is the sandwich complete (top bread on) and placed on the plate?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "sandwich_complete": true/false, "on_plate": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["bread", "plate"],
      expectedDurationSec: 5,
    },
  ],
};

// ── Protocol: Scrambled Eggs ────────────────────────────

export const EGGS_PROTOCOL: KitchenProtocol = {
  id: "kitchen-eggs-v1",
  name: "Scrambled Eggs",
  description: "Cooking scrambled eggs — tests appliance monitoring (stove), temperature awareness, timing, and texture/doneness judgment. The most advanced beginner demo.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  tags: ["cooking", "intermediate", "heat", "timing", "appliance", "texture"],

  requiredInventory: [
    { name: "eggs", category: "ingredient" },
    { name: "butter", category: "ingredient" },
    { name: "pan", category: "tool" },
    { name: "spatula", category: "tool" },
    { name: "bowl", category: "tool" },
    { name: "fork", category: "tool" },
    { name: "plate", category: "tool" },
    { name: "stove", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for scrambled eggs. I need: eggs, butter, a pan, a spatula, a bowl, a fork, a plate, and access to a stove.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Crack 2-3 eggs into the bowl",
      successCriteria: "Raw eggs visible in the bowl, shells set aside",
      verificationPrompt: `Are there cracked eggs in the bowl? Look for yellow yolks and clear whites in the bowl.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "egg_count": <visible count>, "reasoning": "brief explanation"}`,
      requiredObjects: ["eggs", "bowl"],
      hazardChecks: ["Check for shell fragments in the bowl"],
      expectedDurationSec: 20,
    },
    {
      number: 2,
      instruction: "Beat the eggs with a fork until uniform yellow",
      successCriteria: "Egg mixture is uniform yellow with no visible white streaks",
      verificationPrompt: `Have the eggs been beaten? Look for a uniform yellow mixture (no separate white/yolk visible).
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "mixture_uniform": true/false, "color": "<description>", "reasoning": "brief explanation"}`,
      requiredObjects: ["bowl", "fork"],
      expectedDurationSec: 20,
    },
    {
      number: 3,
      instruction: "Melt butter in the pan on medium heat",
      successCriteria: "Pan is on the stove with melted butter coating the surface, butter is liquid and possibly bubbling",
      verificationPrompt: `Is there melted butter in the pan on the stove? Look for liquid butter, possible bubbling, and a hot pan.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "butter_melted": true/false, "heat_level": "off|low|medium|high", "reasoning": "brief explanation"}`,
      requiredObjects: ["pan", "butter", "stove"],
      hazardChecks: ["Pan handle should face inward", "Stove on medium — not high"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 30,
    },
    {
      number: 4,
      instruction: "Pour eggs into the pan and stir gently with the spatula",
      successCriteria: "Eggs are in the pan, being stirred, forming soft curds",
      verificationPrompt: `Are eggs cooking in the pan? Look for: yellow egg mixture in pan, spatula stirring, soft curds forming.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "eggs_in_pan": true/false, "curds_forming": true/false, "doneness": "raw|runny|soft|firm|overcooked", "reasoning": "brief explanation"}`,
      requiredObjects: ["pan", "spatula"],
      hazardChecks: ["Don't overcook — remove when slightly underdone (carryover heat)"],
      expectedDurationSec: 120,
    },
    {
      number: 5,
      instruction: "Plate the scrambled eggs",
      successCriteria: "Scrambled eggs are on the plate, pan removed from heat",
      verificationPrompt: `Have the scrambled eggs been plated? Look for cooked egg curds on a plate.
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "eggs_on_plate": true/false, "appearance": "soft and creamy|firm|dry", "reasoning": "brief explanation"}`,
      requiredObjects: ["plate", "spatula"],
      expectedDurationSec: 10,
    },
  ],
};

// ── Protocol Registry ───────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Directory for user-created / video-extracted protocols */
const PROTOCOLS_DIR = path.resolve(__dirname, "..", "..", "..", "data", "protocols");

/** Built-in protocols */
const BUILTIN_PROTOCOLS: KitchenProtocol[] = [
  TEA_PROTOCOL,
  TOAST_PROTOCOL,
  MEASURE_POUR_PROTOCOL,
  SANDWICH_PROTOCOL,
  EGGS_PROTOCOL,
  ...RICH_RECIPE_PROTOCOLS,
];

const protocolStore = createProtocolStore(BUILTIN_PROTOCOLS, PROTOCOLS_DIR);

export const loadUserProtocols = protocolStore.loadUserProtocols;
export const saveProtocol = protocolStore.saveProtocol;
export const deleteProtocol = protocolStore.deleteProtocol;
export const getProtocol = protocolStore.getProtocol;
export const listProtocols = protocolStore.listProtocols;

// Load user protocols on module init
loadUserProtocols();
