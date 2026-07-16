import { saveProtocol } from "./protocols.js";
import type { ERAnalysisMode } from "./er-modes.js";
import { ER_THINKING } from "../er-utils.js";

export const YOUTUBE_RE =
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+|^https?:\/\/youtu\.be\/[\w-]+/;

export function isYouTubeUrl(url: string) {
  return YOUTUBE_RE.test(url);
}

export function buildVideoAnalysisMode(prompt?: string): ERAnalysisMode {
  const userPrompt = prompt || "Watch this cooking video and extract a detailed protocol.";

  return {
    id: "video-analysis",
    name: "Video Protocol Extraction",
    prompt: `${userPrompt}

Structure your response as JSON:
{
  "title": "<recipe/protocol name>",
  "description": "<brief summary>",
  "totalDurationMinutes": <estimated total time>,
  "difficulty": "beginner|intermediate|advanced",
  "steps": [
    {
      "step_number": <number>,
      "action": "<short action name>",
      "instruction": "<detailed instruction for the user>",
      "duration_seconds": <estimated duration>,
      "required_objects": ["<tools and ingredients needed>"],
      "visual_reference_time": "<timestamp in video>",
      "safety_notes": ["<any hazards>"],
      "verification_criteria": "<how to know this step is done>"
    }
  ],
  "required_inventory": [
    { "name": "<item>", "category": "ingredient|tool|appliance" }
  ],
  "tips": ["<helpful tips observed in the video>"]
}`,
    systemInstruction:
      "You are an expert kitchen protocol analyzer. Watch the video carefully and extract every step in precise detail. Output ONLY valid JSON.",
    thinkingBudget: ER_THINKING.THOROUGH,
    outputType: "json",
  };
}

export function buildVideoToProtocolMode(protocolId?: string): ERAnalysisMode {
  return {
    id: "video-to-protocol",
    name: "Video to LabOS Protocol",
    prompt: `Watch this cooking video and extract a complete LabOS kitchen protocol.

A LabOS protocol has these exact fields. Output ONLY this JSON:
{
  "id": "${protocolId || "video-extracted-v1"}",
  "name": "<recipe name>",
  "description": "<1-2 sentence description including what ER capabilities are tested>",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": <number>,
  "tags": ["<relevant tags>"],
  "requiredInventory": [
    { "name": "<item>", "category": "ingredient|tool|appliance" }
  ],
  "workspaceVerificationPrompt": "Point to all items needed for <recipe>. I need: <comma-separated list>.\\nFor any missing items, label them as \\"MISSING: <item>\\".\\n\\nThe answer should follow the JSON format:\\n[{\\"point\\": <point>, \\"label\\": <label>}]\\nThe points are in [y, x] format normalized to 0-1000.",
  "steps": [
    {
      "number": <1-indexed>,
      "instruction": "<clear human-readable instruction>",
      "successCriteria": "<what ER should look for to confirm completion>",
      "verificationPrompt": "<ER prompt asking if step is done, requesting JSON response with success/confidence/reasoning>",
      "requiredObjects": ["<items needed for this step>"],
      "spatialHint": "<where in workspace this should happen>",
      "hazardChecks": ["<safety concerns>"],
      "instrumentReads": ["<any gauges/timers/displays to read>"],
      "expectedDurationSec": <number>
    }
  ]
}

Make the verificationPrompt for each step specific and include a JSON response format like:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}
Include additional relevant fields per step based on what the model should verify.`,
    systemInstruction:
      "You are an expert at converting cooking videos into structured LabOS protocols for smart glasses guidance. Extract every observable step. Be precise with verification prompts - they will be used by Gemini Robotics ER to verify step completion via camera frames. Output ONLY valid JSON.",
    thinkingBudget: ER_THINKING.THOROUGH,
    outputType: "json",
  };
}

export function buildSearchGroundedMode(query: string): ERAnalysisMode {
  return {
    id: "search-grounded",
    name: "Search-Grounded Analysis",
    prompt: query,
    systemInstruction:
      "You are a kitchen assistant with access to Google Search. Use search results to provide accurate, up-to-date information. If analyzing an image or video alongside the search, combine visual analysis with search results.",
    thinkingBudget: ER_THINKING.MEDIUM,
    outputType: "text",
  };
}

export function saveExtractedProtocol(protocol: any, videoUrl: string) {
  if (!protocol || protocol.parseError || !protocol.id || !protocol.name || !protocol.steps?.length) {
    return undefined;
  }

  protocol.sourceVideo = videoUrl;
  protocol.extractedAt = new Date().toISOString();
  return saveProtocol(protocol);
}

export function trySaveExtractedProtocol(protocol: any, videoUrl: string) {
  try {
    const savedPath = saveExtractedProtocol(protocol, videoUrl);
    if (savedPath) {
      console.log(`[Kitchen] Saved extracted protocol "${protocol.id}" to ${savedPath}`);
    }
    return savedPath;
  } catch (error) {
    console.warn("[Kitchen] Failed to save protocol:", (error as Error).message);
    return undefined;
  }
}
