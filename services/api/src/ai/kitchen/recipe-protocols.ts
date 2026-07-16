import type { KitchenProtocol } from "./protocol-types.js";

export const RAMEN_PROTOCOL: KitchenProtocol = {
  id: "kitchen-ramen-v1",
  name: "Stovetop Ramen",
  description:
    "A complete beginner hot-meal protocol covering burner setup, water level, boil state, noodle softening, seasoning dispersion, and safe hot-liquid transfer.",
  difficulty: "beginner",
  estimatedMinutes: 10,
  tags: ["cooking", "ramen", "stovetop", "hot-liquid", "beginner", "meal"],

  requiredInventory: [
    { name: "instant ramen pack", category: "ingredient" },
    { name: "water", category: "ingredient" },
    { name: "pot", category: "tool" },
    { name: "stirring utensil", category: "tool" },
    { name: "serving bowl", category: "tool" },
    { name: "stove", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for stovetop ramen. I need: instant ramen, water, a pot, a stirring utensil, a serving bowl, and access to a stove.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Place the pot on the burner and add enough water for one serving",
      successCriteria: "Pot is centered on a burner with a visible water level inside",
      verificationPrompt: `Is a pot centered on a stove burner with water visible inside it?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "pot_on_burner": true/false, "water_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["pot", "water", "stove"],
      spatialHint: "Pot should be centered over one burner with the handle turned away from the counter edge",
      hazardChecks: ["Pot must sit flat on the burner", "Keep water away from burner controls"],
      expectedDurationSec: 45,
    },
    {
      number: 2,
      instruction: "Turn the burner to medium-high and wait for a steady boil",
      successCriteria: "Burner is on and the water shows bubbling or steam consistent with boiling",
      verificationPrompt: `Is the burner heating the pot and is the water boiling or close to boiling?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "burner_on": true/false, "boil_state": "cold|warming|simmer|boil", "reasoning": "brief explanation"}`,
      requiredObjects: ["pot", "stove"],
      spatialHint: "Check the active burner, pot position, steam, bubbles, and knob setting",
      hazardChecks: ["Pot handle should face inward", "Steam path should be clear of hands and face"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 180,
    },
    {
      number: 3,
      instruction: "Add the noodle block and submerge it with the utensil",
      successCriteria: "Noodles are in the pot and at least partly submerged in hot water",
      verificationPrompt: `Are ramen noodles visible in the pot and being submerged into the hot water?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "noodles_in_pot": true/false, "submerged": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["instant ramen pack", "pot", "stirring utensil"],
      spatialHint: "Noodle block should go into the pot opening, not beside the burner",
      hazardChecks: ["Avoid dropping noodles from height into boiling water", "Watch for steam burns"],
      expectedDurationSec: 30,
    },
    {
      number: 4,
      instruction: "Cook until the noodles loosen, then stir in the seasoning",
      successCriteria: "Noodles have separated and seasoning is dispersed through the broth",
      verificationPrompt: `Have the noodles loosened and has seasoning been added and stirred into the broth?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "noodles_loosened": true/false, "seasoning_added": true/false, "broth_uniform": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["instant ramen pack", "pot", "stirring utensil"],
      spatialHint: "Look for separated strands and broth color change after seasoning",
      hazardChecks: ["Stir gently to avoid splashing hot broth"],
      expectedDurationSec: 180,
    },
    {
      number: 5,
      instruction: "Turn off the burner before serving",
      successCriteria: "Stove control is off before the pot is lifted or poured",
      verificationPrompt: `Is the burner turned off before the pot is moved for serving?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "burner_off": true/false, "pot_still_stable": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["stove", "pot"],
      hazardChecks: ["Confirm heat is off before lifting the pot"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 10,
    },
    {
      number: 6,
      instruction: "Pour or ladle the ramen into the serving bowl",
      successCriteria: "Cooked noodles and broth are in the serving bowl with the pot returned safely",
      verificationPrompt: `Has the cooked ramen been transferred into the serving bowl safely?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "ramen_in_bowl": true/false, "spill_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["serving bowl", "pot"],
      spatialHint: "Serving bowl should be on a stable counter near the pot, away from the stove edge",
      hazardChecks: ["Hot liquid pour risk", "Use two hands or a ladle for control"],
      expectedDurationSec: 45,
    },
  ],
};

export const PASTA_PROTOCOL: KitchenProtocol = {
  id: "kitchen-pasta-v1",
  name: "Pasta With Sauce",
  description:
    "A durable pasta workflow that tests boil detection, timer use, al dente checking, straining safety, and sauce finishing.",
  difficulty: "intermediate",
  estimatedMinutes: 20,
  tags: ["cooking", "pasta", "stovetop", "timing", "straining", "meal"],

  requiredInventory: [
    { name: "dry pasta", category: "ingredient" },
    { name: "pasta sauce", category: "ingredient" },
    { name: "salt", category: "ingredient" },
    { name: "large pot", category: "tool" },
    { name: "colander", category: "tool" },
    { name: "saucepan", category: "tool" },
    { name: "stirring spoon", category: "tool" },
    { name: "stove", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for pasta with sauce. I need: dry pasta, sauce, salt, a large pot, colander, saucepan, stirring spoon, and stove.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Fill the large pot with water, salt it, and place it on the stove",
      successCriteria: "Large pot contains water, salt has been added, and pot is on a burner",
      verificationPrompt: `Is the pasta pot prepared with water and salt on a stove burner?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "pot_on_burner": true/false, "water_visible": true/false, "salt_added": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["large pot", "water", "salt", "stove"],
      hazardChecks: ["Pot should not be filled near the rim", "Pot must be stable on the burner"],
      expectedDurationSec: 60,
    },
    {
      number: 2,
      instruction: "Bring the water to a rolling boil before adding pasta",
      successCriteria: "Water shows continuous large bubbles before dry pasta is added",
      verificationPrompt: `Is the water at a rolling boil before pasta is added?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "boil_state": "cold|warming|simmer|rolling_boil", "pasta_already_added": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["large pot", "stove"],
      hazardChecks: ["Steam burn risk over the pot"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 480,
    },
    {
      number: 3,
      instruction: "Add pasta, stir immediately, and start the timer",
      successCriteria: "Pasta is in boiling water, being stirred, and a timer is active",
      verificationPrompt: `Has pasta been added to the boiling water, stirred, and timed?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "pasta_in_pot": true/false, "stirring_visible": true/false, "timer_active": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["dry pasta", "large pot", "stirring spoon"],
      hazardChecks: ["Add pasta slowly to avoid splashing boiling water"],
      instrumentReads: ["timer display or package cook time"],
      expectedDurationSec: 45,
    },
    {
      number: 4,
      instruction: "Warm the sauce in a saucepan while pasta cooks",
      successCriteria: "Sauce is in a saucepan over low or medium heat and being stirred occasionally",
      verificationPrompt: `Is sauce warming in a separate saucepan at a controlled heat?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "sauce_in_pan": true/false, "heat_level": "off|low|medium|high", "stirred": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["pasta sauce", "saucepan", "stirring spoon", "stove"],
      hazardChecks: ["Sauce should not be boiling aggressively or scorching"],
      instrumentReads: ["sauce burner dial setting"],
      expectedDurationSec: 300,
    },
    {
      number: 5,
      instruction: "Drain the pasta in the sink using the colander",
      successCriteria: "Pasta is transferred into the colander and hot water drains away safely",
      verificationPrompt: `Has the pasta been drained through a colander in the sink?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "colander_in_sink": true/false, "pasta_in_colander": true/false, "spill_or_splash": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["large pot", "colander"],
      spatialHint: "Colander should be inside the sink before the pot is tipped",
      hazardChecks: ["Hot water pour risk", "Keep face and hands away from steam"],
      expectedDurationSec: 60,
    },
    {
      number: 6,
      instruction: "Combine pasta with warm sauce and plate it",
      successCriteria: "Pasta is coated with sauce and served on a plate or bowl",
      verificationPrompt: `Is the pasta coated with sauce and served?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "sauce_coating": "none|partial|even", "served": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["pasta", "pasta sauce", "serving bowl"],
      expectedDurationSec: 90,
    },
  ],
};

export const STIR_FRY_PROTOCOL: KitchenProtocol = {
  id: "kitchen-stir-fry-v1",
  name: "Vegetable Stir-Fry",
  description:
    "A fast high-heat workflow that emphasizes mise en place, knife safety, burner control, movement, and sequencing before anything burns.",
  difficulty: "advanced",
  estimatedMinutes: 18,
  tags: ["cooking", "stir-fry", "knife-skills", "high-heat", "vegetables", "meal"],

  requiredInventory: [
    { name: "mixed vegetables", category: "ingredient" },
    { name: "oil", category: "ingredient" },
    { name: "stir-fry sauce", category: "ingredient" },
    { name: "wok or skillet", category: "tool" },
    { name: "knife", category: "tool" },
    { name: "cutting board", category: "tool" },
    { name: "spatula or tongs", category: "tool" },
    { name: "stove", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for vegetable stir-fry. I need: vegetables, oil, sauce, wok or skillet, knife, cutting board, spatula or tongs, and stove.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Wash and dry the vegetables before cutting",
      successCriteria: "Vegetables are clean, drained, and not visibly wet before they reach the hot pan",
      verificationPrompt: `Are the vegetables washed and reasonably dry before cutting or cooking?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "washed": true/false, "excess_water_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["mixed vegetables", "sink or towel"],
      hazardChecks: ["Wet vegetables can splatter in hot oil"],
      expectedDurationSec: 120,
    },
    {
      number: 2,
      instruction: "Cut vegetables into similar bite-size pieces",
      successCriteria: "Vegetables are cut into roughly even pieces on the cutting board",
      verificationPrompt: `Are vegetables cut into similar bite-size pieces on the cutting board?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "pieces_even": true/false, "knife_safe": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["mixed vegetables", "knife", "cutting board"],
      spatialHint: "Knife should stay on the board, fingers curled back while cutting",
      hazardChecks: ["Sharp knife", "Keep cutting board stable"],
      expectedDurationSec: 300,
    },
    {
      number: 3,
      instruction: "Complete mise en place: set all cut vegetables and sauce within reach before heating the pan",
      successCriteria: "Cut vegetables, sauce, and spatula are staged near the stove before burner is on",
      verificationPrompt: `Is mise en place complete before heating: cut vegetables, sauce, and utensil all within reach?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "vegetables_staged": true/false, "sauce_staged": true/false, "utensil_staged": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["mixed vegetables", "stir-fry sauce", "spatula or tongs"],
      spatialHint: "Everything should be reachable without leaving a hot pan unattended",
      expectedDurationSec: 45,
    },
    {
      number: 4,
      instruction: "Heat oil in the wok or skillet until shimmering",
      successCriteria: "Pan is on the burner with a thin layer of hot oil, but oil is not smoking heavily",
      verificationPrompt: `Is oil heated in the wok or skillet and ready for stir-frying?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "oil_in_pan": true/false, "heat_level": "off|low|medium|high", "smoking": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["wok or skillet", "oil", "stove"],
      hazardChecks: ["Do not leave hot oil unattended", "If oil smokes heavily, lower heat"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 60,
    },
    {
      number: 5,
      instruction: "Add vegetables and keep them moving until crisp-tender",
      successCriteria: "Vegetables are in the pan and being tossed or stirred frequently",
      verificationPrompt: `Are vegetables being stir-fried with frequent movement and no obvious burning?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "vegetables_in_pan": true/false, "movement_visible": true/false, "burning_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["mixed vegetables", "wok or skillet", "spatula or tongs"],
      hazardChecks: ["Hot oil splatter", "Pan handle should face inward"],
      expectedDurationSec: 300,
    },
    {
      number: 6,
      instruction: "Add sauce, toss to glaze, turn off heat, and serve",
      successCriteria: "Vegetables are evenly coated with sauce, heat is off, and food is served",
      verificationPrompt: `Has sauce been added, the vegetables glazed, heat turned off, and the stir-fry served?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "sauce_added": true/false, "coating_even": true/false, "heat_off": true/false, "served": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["stir-fry sauce", "wok or skillet", "serving bowl"],
      hazardChecks: ["Sauce can splatter on a very hot pan"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 90,
    },
  ],
};

export const PANCAKES_PROTOCOL: KitchenProtocol = {
  id: "kitchen-pancakes-v1",
  name: "Pancakes",
  description:
    "A breakfast protocol for batter consistency, griddle temperature, portioning, bubble-based flip timing, and visual doneness.",
  difficulty: "intermediate",
  estimatedMinutes: 18,
  tags: ["breakfast", "batter", "griddle", "timing", "texture", "cooking"],

  requiredInventory: [
    { name: "pancake mix or flour blend", category: "ingredient" },
    { name: "milk or water", category: "ingredient" },
    { name: "egg", category: "ingredient" },
    { name: "butter or oil", category: "ingredient" },
    { name: "mixing bowl", category: "tool" },
    { name: "whisk", category: "tool" },
    { name: "ladle or measuring cup", category: "tool" },
    { name: "spatula", category: "tool" },
    { name: "skillet or griddle", category: "tool" },
    { name: "stove", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for pancakes. I need: pancake mix or flour blend, liquid, egg, butter or oil, bowl, whisk, ladle, spatula, skillet or griddle, and stove.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Measure the dry mix and wet ingredients into the bowl",
      successCriteria: "Dry mix and wet ingredients are visibly in the mixing bowl",
      verificationPrompt: `Are the pancake dry mix and wet ingredients in the mixing bowl?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "dry_mix_visible": true/false, "wet_ingredients_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["pancake mix or flour blend", "milk or water", "egg", "mixing bowl"],
      expectedDurationSec: 90,
    },
    {
      number: 2,
      instruction: "Whisk until combined but still slightly lumpy",
      successCriteria: "Batter is pourable, mostly combined, and not overmixed smooth",
      verificationPrompt: `Is the pancake batter combined with a pourable texture and small lumps remaining?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "batter_combined": true/false, "texture": "dry|lumpy_pourable|smooth_overmixed|runny", "reasoning": "brief explanation"}`,
      requiredObjects: ["mixing bowl", "whisk"],
      expectedDurationSec: 60,
    },
    {
      number: 3,
      instruction: "Heat and lightly grease the skillet or griddle",
      successCriteria: "Skillet or griddle is heated on medium with a thin layer of butter or oil",
      verificationPrompt: `Is the skillet or griddle heated and lightly greased for pancakes?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "pan_heated": true/false, "greased": true/false, "heat_level": "off|low|medium|high", "reasoning": "brief explanation"}`,
      requiredObjects: ["skillet or griddle", "butter or oil", "stove"],
      hazardChecks: ["Pan handle should face inward", "Medium heat, not high"],
      instrumentReads: ["stove dial setting"],
      expectedDurationSec: 120,
    },
    {
      number: 4,
      instruction: "Pour batter portions with space between pancakes",
      successCriteria: "Round batter portions are on the hot surface with enough spacing to flip",
      verificationPrompt: `Are pancake batter portions on the skillet or griddle with room between them?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "portion_count": <number>, "spacing_ok": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["mixing bowl", "ladle or measuring cup", "skillet or griddle"],
      spatialHint: "Each pancake should have enough perimeter clearance for the spatula",
      hazardChecks: ["Avoid dripping batter onto burner controls"],
      expectedDurationSec: 45,
    },
    {
      number: 5,
      instruction: "Flip when edges set and bubbles break on the surface",
      successCriteria: "Pancakes are flipped after visible bubbles and set edges, not while fully wet",
      verificationPrompt: `Are the pancakes ready to flip or already flipped at the right visual stage?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "bubbles_visible": true/false, "edges_set": true/false, "flipped": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["spatula", "skillet or griddle"],
      hazardChecks: ["Keep fingers away from hot surface"],
      expectedDurationSec: 180,
    },
    {
      number: 6,
      instruction: "Cook the second side until golden, then plate",
      successCriteria: "Pancakes are golden on both sides and served on a plate",
      verificationPrompt: `Are the pancakes cooked through and plated?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "color": "pale|golden|dark|burned", "plated": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["spatula", "plate"],
      expectedDurationSec: 120,
    },
  ],
};

export const SALAD_PROTOCOL: KitchenProtocol = {
  id: "kitchen-salad-v1",
  name: "Chopped Salad",
  description:
    "A cold-prep protocol for washing, drying, knife work, dressing emulsification, tossing, and final seasoning without appliance dependencies.",
  difficulty: "beginner",
  estimatedMinutes: 12,
  tags: ["cold-prep", "salad", "knife-skills", "washing", "dressing", "vegetables"],

  requiredInventory: [
    { name: "leafy greens", category: "ingredient" },
    { name: "cucumber or tomato", category: "ingredient" },
    { name: "olive oil", category: "ingredient" },
    { name: "vinegar or lemon", category: "ingredient" },
    { name: "salt", category: "ingredient" },
    { name: "knife", category: "tool" },
    { name: "cutting board", category: "tool" },
    { name: "salad bowl", category: "tool" },
    { name: "small jar or bowl", category: "tool" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for a chopped salad. I need: greens, cucumber or tomato, oil, acid, salt, knife, cutting board, salad bowl, and small jar or bowl.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Wash greens and vegetables, then dry them well",
      successCriteria: "Produce is clean and no large water pools remain on leaves or board",
      verificationPrompt: `Are the greens and vegetables washed and dried enough for salad assembly?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "washed": true/false, "excess_water_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["leafy greens", "cucumber or tomato"],
      hazardChecks: ["Wet cutting boards can slip; dry the board before knife work"],
      expectedDurationSec: 180,
    },
    {
      number: 2,
      instruction: "Chop the vegetables into bite-size pieces",
      successCriteria: "Vegetables are cut into manageable pieces on the board",
      verificationPrompt: `Are the vegetables chopped into bite-size pieces with safe knife handling?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "chopped": true/false, "knife_safe": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["knife", "cutting board", "cucumber or tomato"],
      spatialHint: "Keep fingertips curled back and cut on a stable board",
      hazardChecks: ["Sharp knife", "Stabilize round vegetables before slicing"],
      expectedDurationSec: 180,
    },
    {
      number: 3,
      instruction: "Tear or chop greens and place everything in the salad bowl",
      successCriteria: "Greens and chopped vegetables are together in the salad bowl",
      verificationPrompt: `Are greens and chopped vegetables combined in the salad bowl?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "greens_in_bowl": true/false, "vegetables_in_bowl": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["leafy greens", "salad bowl", "cucumber or tomato"],
      expectedDurationSec: 90,
    },
    {
      number: 4,
      instruction: "Mix oil, vinegar or lemon, and salt into a dressing",
      successCriteria: "Dressing ingredients are combined in a small jar or bowl",
      verificationPrompt: `Has a dressing been mixed from oil, acid, and salt?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "oil_present": true/false, "acid_present": true/false, "mixed": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["olive oil", "vinegar or lemon", "salt", "small jar or bowl"],
      expectedDurationSec: 60,
    },
    {
      number: 5,
      instruction: "Dress and toss the salad until lightly coated",
      successCriteria: "Dressing is added and greens look lightly coated rather than drenched",
      verificationPrompt: `Has dressing been added and tossed through the salad evenly?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "dressing_added": true/false, "coating": "none|light|heavy|uneven", "reasoning": "brief explanation"}`,
      requiredObjects: ["salad bowl", "dressing"],
      expectedDurationSec: 60,
    },
    {
      number: 6,
      instruction: "Taste, adjust seasoning, and serve",
      successCriteria: "Salad is served after final salt or acid adjustment",
      verificationPrompt: `Is the salad finished and ready to serve after final seasoning?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "served": true/false, "final_adjustment_visible": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["salad bowl", "salt"],
      expectedDurationSec: 45,
    },
  ],
};

export const COOKIES_PROTOCOL: KitchenProtocol = {
  id: "kitchen-cookies-v1",
  name: "Chocolate Chip Cookies",
  description:
    "A baking protocol with precise measuring, dough texture, tray spacing, oven preheat checks, doneness judgment, and cooling.",
  difficulty: "advanced",
  estimatedMinutes: 35,
  tags: ["baking", "cookies", "oven", "measuring", "dough", "dessert"],

  requiredInventory: [
    { name: "flour", category: "ingredient" },
    { name: "sugar", category: "ingredient" },
    { name: "butter", category: "ingredient" },
    { name: "egg", category: "ingredient" },
    { name: "chocolate chips", category: "ingredient" },
    { name: "mixing bowl", category: "tool" },
    { name: "measuring cups", category: "tool" },
    { name: "spoon or mixer", category: "tool" },
    { name: "baking sheet", category: "tool" },
    { name: "oven", category: "appliance" },
  ],

  workspaceVerificationPrompt: `Point to all items needed for chocolate chip cookies. I need: flour, sugar, butter, egg, chocolate chips, bowl, measuring cups, spoon or mixer, baking sheet, and oven.
For any missing items, label them as "MISSING: <item>".

The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  steps: [
    {
      number: 1,
      instruction: "Preheat the oven and prepare the baking sheet",
      successCriteria: "Oven is preheating to the target temperature and baking sheet is ready",
      verificationPrompt: `Is the oven preheating and is the baking sheet prepared?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "oven_preheating": true/false, "temperature_visible": true/false, "sheet_ready": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["oven", "baking sheet"],
      hazardChecks: ["Oven heat risk", "Keep towels and packaging away from oven burners or elements"],
      instrumentReads: ["oven temperature display"],
      expectedDurationSec: 120,
    },
    {
      number: 2,
      instruction: "Measure dry ingredients into the mixing bowl",
      successCriteria: "Flour and sugar are measured and visible in the bowl",
      verificationPrompt: `Are the dry ingredients measured into the mixing bowl?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "flour_visible": true/false, "sugar_visible": true/false, "measuring_tool_used": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["flour", "sugar", "measuring cups", "mixing bowl"],
      expectedDurationSec: 180,
    },
    {
      number: 3,
      instruction: "Mix in butter and egg until dough forms",
      successCriteria: "Ingredients have formed a cohesive cookie dough",
      verificationPrompt: `Has the butter and egg been mixed into a cohesive cookie dough?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "dough_formed": true/false, "texture": "dry|cohesive|runny|overmixed", "reasoning": "brief explanation"}`,
      requiredObjects: ["butter", "egg", "mixing bowl", "spoon or mixer"],
      expectedDurationSec: 240,
    },
    {
      number: 4,
      instruction: "Fold chocolate chips into the dough",
      successCriteria: "Chocolate chips are distributed through the dough",
      verificationPrompt: `Are chocolate chips mixed through the cookie dough?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "chips_visible": true/false, "distributed": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["chocolate chips", "mixing bowl", "spoon or mixer"],
      expectedDurationSec: 60,
    },
    {
      number: 5,
      instruction: "Portion dough balls onto the baking sheet with space between them",
      successCriteria: "Dough portions are evenly spaced on the baking sheet",
      verificationPrompt: `Are cookie dough portions spaced on the baking sheet with room to spread?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "portion_count": <number>, "spacing_ok": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["cookie dough", "baking sheet"],
      spatialHint: "Leave visible gaps between dough balls on all sides",
      expectedDurationSec: 180,
    },
    {
      number: 6,
      instruction: "Bake until edges are set and lightly golden, then cool on the tray",
      successCriteria: "Cookies are baked with set edges, removed safely, and cooling before serving",
      verificationPrompt: `Are the cookies baked to the correct doneness and cooling safely?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "edges_set": true/false, "color": "pale|golden|dark|burned", "cooling": true/false, "reasoning": "brief explanation"}`,
      requiredObjects: ["oven", "baking sheet"],
      hazardChecks: ["Use oven mitts", "Hot tray risk", "Let cookies cool before handling"],
      instrumentReads: ["oven timer or clock"],
      expectedDurationSec: 900,
    },
  ],
};

export const RICH_RECIPE_PROTOCOLS: KitchenProtocol[] = [
  RAMEN_PROTOCOL,
  PASTA_PROTOCOL,
  STIR_FRY_PROTOCOL,
  PANCAKES_PROTOCOL,
  SALAD_PROTOCOL,
  COOKIES_PROTOCOL,
];
