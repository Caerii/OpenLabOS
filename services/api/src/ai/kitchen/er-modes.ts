/**
 * Gemini Robotics ER 1.6 — Analysis Modes for Kitchen Demo.
 *
 * Each mode represents a distinct ER capability that can be triggered
 * independently or composed into multi-step kitchen protocol analysis.
 * Modes return structured prompt + config objects ready for the AI pipeline.
 *
 * Modes:
 *   SPATIAL_INVENTORY — Detect and locate all objects in the workspace
 *   OBJECT_POINTING  — Find specific named objects
 *   BOUNDING_BOXES   — Full object detection with regions
 *   TRAJECTORY       — Plan movement paths between objects
 *   INSTRUMENT_READ  — Read displays, gauges, measuring marks
 *   SUCCESS_CHECK    — Verify if a protocol step is complete
 *   COUNTING         — Count instances of an object type
 *   WORKSPACE_CLEAR  — Spatial reasoning about what to move/reorganize
 *   SAFETY_CHECK     — Detect hazards in the scene
 */

import { ER_THINKING, ER_PROMPTS, type ERThinkingBudget } from "../er-utils.js";
import type { KitchenProtocol, ProtocolStep } from "./protocol-types.js";
import { vqaAnnotationPrompt, type StepVqaQuestion } from "./vqa-annotations.js";

// ── Analysis Mode Types ─────────────────────────────────

export interface ERAnalysisMode {
  /** Mode identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** The prompt to send alongside the frame image */
  prompt: string;
  /** System instruction (if needed) */
  systemInstruction?: string;
  /** Thinking budget for this mode */
  thinkingBudget: ERThinkingBudget;
  /** Whether this mode needs code execution tool */
  useCodeExecution?: boolean;
  /** Expected output type for parsing */
  outputType: "points" | "boxes" | "trajectory" | "json" | "text";
}

// ── Mode Factories ──────────────────────────────────────

/**
 * SPATIAL INVENTORY — Detect and locate everything on the workspace.
 * Uses pointing to identify up to 20 objects with labels.
 * Best for: "What's on the counter?" initial state capture.
 */
export function spatialInventoryMode(maxItems = 20): ERAnalysisMode {
  return {
    id: "spatial-inventory",
    name: "Spatial Inventory",
    prompt: `Point to up to ${maxItems} items in this kitchen workspace. For each item, provide a descriptive label that includes its state (e.g., "empty mug", "sliced tomato", "running faucet").

${ER_PROMPTS.POINT_FORMAT}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "points",
  };
}

/**
 * OBJECT POINTING — Find specific named objects in the scene.
 * Uses pointing to locate queried objects.
 * Best for: "Where is the measuring cup?" / step prerequisite checking.
 */
export function objectPointingMode(objects: string[]): ERAnalysisMode {
  const objectList = objects.join(", ");
  return {
    id: "object-pointing",
    name: "Object Pointing",
    prompt: `Get all points matching the following objects: ${objectList}. The label returned should be an identifying name for the object detected. If an object is not visible, do not include it.

${ER_PROMPTS.POINT_FORMAT}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "points",
  };
}

/**
 * BOUNDING BOXES — Full object detection with labeled regions.
 * Best for: detailed workspace mapping, COCO annotation, AR overlay.
 */
export function boundingBoxMode(maxObjects = 25): ERAnalysisMode {
  return {
    id: "bounding-boxes",
    name: "Bounding Box Detection",
    prompt: `Detect all objects in this kitchen scene. Limit to ${maxObjects} objects. Include tools, ingredients, appliances, and hands.
If an object is present multiple times, name them according to their unique characteristic (color, size, position).

${ER_PROMPTS.BOX_FORMAT}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "boxes",
  };
}

/**
 * TRAJECTORY — Plan a movement path between two points/objects.
 * Uses ordered point sequences for action guidance.
 * Best for: "Move the knife to the cutting board" motion planning.
 */
export function trajectoryMode(
  fromObject: string,
  toObject: string,
  numPoints = 10
): ERAnalysisMode {
  return {
    id: "trajectory",
    name: "Trajectory Planning",
    prompt: `Place a point on the ${fromObject}, then ${numPoints} points for the trajectory of moving the ${fromObject} to the ${toObject}.

The trajectory should avoid obstacles and follow a natural hand-movement path.

${ER_PROMPTS.TRAJECTORY_FORMAT}`,
    thinkingBudget: ER_THINKING.DEFAULT,  // model decides for trajectory
    outputType: "trajectory",
  };
}

/**
 * INSTRUMENT READING — Read displays, gauges, measurement marks.
 * Uses code execution for precision math when available.
 * Best for: thermometer, timer, measuring cup lines, oven display.
 */
export function instrumentReadMode(instrumentDescription: string): ERAnalysisMode {
  return {
    id: "instrument-read",
    name: "Instrument Reading",
    prompt: `Read the ${instrumentDescription} in this image.
To read it:
1) Find the relevant measurement points/markings
2) Determine the current reading

${ER_PROMPTS.INSTRUMENT_FORMAT}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "json",
  };
}

/**
 * LIQUID LEVEL — Specialized instrument read for liquid in containers.
 * Best for: measuring cups, kettles with windows, pots being filled.
 */
export function liquidLevelMode(container: string, targetMl?: number): ERAnalysisMode {
  const targetLine = targetMl ? `\nTarget fill level: ${targetMl}ml.` : "";
  return {
    id: "liquid-level",
    name: "Liquid Level Reading",
    prompt: `How full is the ${container}?
To read it:
1) Find the points for the top of the container, bottom of the container, and the liquid level, formatted as [y, x] with values ranging from 0-1000
2) Use the measurement markings if visible to determine exact volume
3) Estimate the fill level as a percentage${targetLine}

Answer with JSON:
{"fill_percent": <number>, "estimated_ml": <number or null>, "level_point": [y, x], "top_point": [y, x], "bottom_point": [y, x], "confidence": 0.0-1.0}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.MEDIUM,
    useCodeExecution: true,
    outputType: "json",
  };
}

/**
 * SUCCESS CHECK — Verify if a protocol step has been completed.
 * Uses the step's verification prompt for targeted detection.
 * Best for: step progression logic, before/after comparison.
 */
export function successCheckMode(verificationPrompt: string): ERAnalysisMode {
  return {
    id: "success-check",
    name: "Step Success Verification",
    prompt: verificationPrompt,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "json",
  };
}

/**
 * STEP VQA ANNOTATION — Ask stable, protocol-scoped questions about a frame.
 * Best for: live annotation and teacher/student training export.
 */
export function vqaAnnotationMode(
  protocol: KitchenProtocol,
  step: ProtocolStep,
  questions?: StepVqaQuestion[],
): ERAnalysisMode {
  return {
    id: "vqa-annotation",
    name: "Step VQA Annotation",
    prompt: vqaAnnotationPrompt({ protocol, step, questions }),
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "json",
  };
}

/**
 * BEFORE/AFTER SUCCESS — Compare two frames to detect task completion.
 * Sends both the "before" frame and "after" frame for comparison.
 * Best for: definitive step verification with visual evidence.
 */
export function beforeAfterMode(taskDescription: string): ERAnalysisMode {
  return {
    id: "before-after",
    name: "Before/After Comparison",
    prompt: `You are seeing two images: the first shows the state BEFORE the action, and the second shows the CURRENT state.

The task was: "${taskDescription}"

Looking at both images, did the person successfully perform this task?
Answer with JSON:
{"success": true/false, "confidence": 0.0-1.0, "changes_detected": ["list of observed changes"], "reasoning": "brief explanation"}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "json",
  };
}

/**
 * COUNTING — Count instances of a specific object type.
 * Uses pointing + reasoning for accuracy.
 * Best for: "How many eggs?", "How many slices?"
 */
export function countingMode(objectType: string): ERAnalysisMode {
  return {
    id: "counting",
    name: "Object Counting",
    prompt: `Point to each ${objectType} in the image. Return the answer in the format:
[{"point": <point>, "label": "${objectType}_<number>"}]

The points are in [y, x] format normalized to 0-1000.
Please share your reasoning about the count.`,
    thinkingBudget: ER_THINKING.THOROUGH,
    outputType: "points",
  };
}

/**
 * WORKSPACE CLEAR — Spatial reasoning about what to move.
 * Best for: "Make room for the cutting board" pre-step planning.
 */
export function workspaceClearMode(needSpaceFor: string): ERAnalysisMode {
  return {
    id: "workspace-clear",
    name: "Workspace Space Planning",
    prompt: `I need space on the counter for: ${needSpaceFor}.
Point to the objects that need to be moved to create enough room.
Also point to where the ${needSpaceFor} should be placed.

Label the items to move as "MOVE: <item>" and the target placement as "PLACE: ${needSpaceFor}".

${ER_PROMPTS.POINT_FORMAT}`,
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "points",
  };
}

/**
 * SAFETY CHECK — Detect kitchen hazards in the current frame.
 * Best for: continuous safety monitoring during cooking.
 */
export function safetyCheckMode(currentActivity?: string): ERAnalysisMode {
  const activityContext = currentActivity
    ? `The person is currently: ${currentActivity}.`
    : "Check the general workspace.";

  return {
    id: "safety-check",
    name: "Safety Hazard Detection",
    prompt: `${activityContext}

Identify any safety hazards in this kitchen scene. Look for:
- Sharp objects in unsafe positions (knife blade up, towards edge)
- Hot surfaces without protection (pot handles facing out, burner on unattended)
- Spills or slippery surfaces
- Cross-contamination risks (raw meat near ready-to-eat food)
- Fire hazards (cloth near flame, oil overheating)
- Improper hand positioning while cutting

Answer with JSON:
{"hazards": [{"type": "<category>", "severity": "low|medium|high", "description": "<what>", "location": [y, x]}], "overall_safe": true/false}

The coordinates are in [y, x] format normalized to 0-1000.`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "json",
  };
}

/**
 * HAND TRACKING — Detect hands, what they're holding, and their actions.
 * Best for: action recognition, technique assessment.
 */
export function handTrackingMode(): ERAnalysisMode {
  return {
    id: "hand-tracking",
    name: "Hand Action Detection",
    prompt: `Detect all visible hands in this egocentric (first-person) kitchen view.
For each hand, identify:
- Which hand (left/right, or if from another person)
- What it's holding (if anything)
- Current action/gesture
- Grip type (pinch, power, precision, etc.)

Return bounding boxes for each hand with descriptive labels.

${ER_PROMPTS.BOX_FORMAT}`,
    systemInstruction: ER_PROMPTS.JSON_SYSTEM,
    thinkingBudget: ER_THINKING.FAST,
    outputType: "boxes",
  };
}

/**
 * NEXT STEP GUIDANCE — Given current state, suggest what to do next.
 * Uses ER's physical task planning for action sequencing.
 * Best for: proactive recipe guidance, "what should I do now?"
 */
export function nextStepGuidanceMode(
  recipeName: string,
  currentStepNumber: number,
  nextInstruction: string,
  requiredObjects: string[]
): ERAnalysisMode {
  return {
    id: "next-step-guidance",
    name: "Next Step Guidance",
    prompt: `I'm making "${recipeName}" and I'm about to do step ${currentStepNumber + 1}: "${nextInstruction}"

Objects I need: ${requiredObjects.join(", ")}

Looking at the current workspace:
1) Point to each required object (or label as "MISSING: <item>" if not visible)
2) Suggest the best trajectory/approach for this action
3) Note any setup needed before starting

Answer with JSON:
{
  "ready": true/false,
  "objects_found": [{"point": [y, x], "label": "<item>"}],
  "missing": ["<items not visible>"],
  "suggestion": "<brief guidance for how to do this step>",
  "setup_needed": "<any prep before starting, or null>"
}

Points are in [y, x] format normalized to 0-1000.`,
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "json",
  };
}

// ── Mode Composition Helpers ────────────────────────────

/**
 * Get the appropriate ER model config parameters for a given mode.
 * Maps thinking budget to the format expected by the Vercel AI SDK's
 * Google provider (which passes through to the Gemini API).
 */
export function getModeConfig(mode: ERAnalysisMode) {
  return {
    temperature: 1.0,  // ER notebook always uses 1.0
    thinkingBudget: mode.thinkingBudget,
    useCodeExecution: mode.useCodeExecution ?? false,
  };
}

/**
 * Get all available mode IDs for the kitchen demo.
 */
export function listAvailableModes(): string[] {
  return [
    "spatial-inventory",
    "object-pointing",
    "bounding-boxes",
    "trajectory",
    "instrument-read",
    "liquid-level",
    "success-check",
    "vqa-annotation",
    "before-after",
    "counting",
    "workspace-clear",
    "safety-check",
    "hand-tracking",
    "next-step-guidance",
  ];
}
