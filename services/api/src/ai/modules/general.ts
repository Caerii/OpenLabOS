/**
 * General Vision Module — the default LabOS egocentric scene understanding pipeline.
 *
 * This is the original frame analysis behavior extracted into a module.
 * Detects objects, hands, text, activity, gaze target, and environment
 * from first-person smart glasses frames.
 */

import { z } from "zod";
import type { ScientificModule } from "./types.js";

export const generalAnalysisSchema = z.object({
  scene: z.string().describe("Brief description of the overall scene from an egocentric (first-person) perspective"),
  objects: z.array(z.object({
    label: z.string().describe("Object name/type"),
    confidence: z.number().min(0).max(1).optional().describe("Detection confidence 0-1"),
    region: z.string().optional().describe("Where in frame: center, top-left, top-right, bottom-left, bottom-right"),
  })).describe("Objects visible in the frame"),
  hands: z.array(z.object({
    side: z.enum(["left", "right"]),
    gesture: z.string().optional().describe("Hand gesture: pointing, grasping, open, pinch, thumbs-up, etc."),
    holding: z.string().optional().describe("What the hand is holding, if anything"),
  })).optional().describe("Hands visible in the frame"),
  text: z.array(z.string()).optional().describe("Any readable text visible in the frame"),
  activity: z.string().optional().describe("What the wearer appears to be doing"),
  gazeTarget: z.string().optional().describe("What the wearer seems to be looking at"),
  environment: z.string().optional().describe("Setting type: indoor/outdoor, office, kitchen, street, etc."),
});

export const GENERAL_SYSTEM_PROMPT = `You are a vision analysis system for LabOS smart glasses (an HMD-class smart-glasses device).
You receive first-person egocentric camera frames from glasses worn by a user.
Analyze what you see from this first-person perspective.

Focus on:
- What objects are visible and where they are in the frame
- Hand positions, gestures, and what they're manipulating
- Any readable text (signs, screens, labels, documents)
- The activity the wearer is performing
- The environment/setting

Be concise but thorough. This data feeds into a training pipeline for improving
egocentric understanding models, so accuracy matters more than prose quality.`;

export const generalModule: ScientificModule = {
  id: "general",
  name: "General Vision",
  description: "General-purpose egocentric scene understanding — objects, hands, text, activity, environment",
  version: "1.1.0",

  systemPrompt: GENERAL_SYSTEM_PROMPT,
  analysisSchema: generalAnalysisSchema,

  pipelineDefaults: {
    intervalMs: 3000,
    maxConcurrent: 2,
    preferredModels: ["google:gemini-2.5-flash", "ollama:llava:7b"],
  },

  cocoCategories: [
    { name: "hand", supercategory: "body" },
    { name: "person", supercategory: "body" },
    { name: "screen", supercategory: "device" },
    { name: "phone", supercategory: "device" },
    { name: "keyboard", supercategory: "device" },
    { name: "book", supercategory: "object" },
    { name: "cup", supercategory: "object" },
    { name: "bottle", supercategory: "object" },
  ],
};
