import fs from "fs";
import { z } from "zod";
import { heuristicModelCapabilities } from "../heuristic-model-profile.js";
import { labosGenerateObject, labosGenerateText } from "../labos-inference.js";
import { fetchLmStudioModels } from "../model-hosts.js";
import { providerIdFromModelId, usesStructuredFramePipeline } from "../model-strategy.js";
import { getProtocol } from "./protocols.js";
import {
  isSafeKitchenFrameRef,
  resolveKitchenArtifactRef,
} from "./artifact-refs.js";
import {
  appendKitchenEvent,
  type KitchenStepSegment,
} from "./run-store.js";
import { saveKitchenSessionManifest } from "./session-manifest.js";
import type { ProtocolStep } from "./protocol-types.js";
import type {
  KitchenStepAnalysisDecision,
  KitchenStepAnalysisRecord,
} from "./step-analysis-types.js";

const DEFAULT_ASYNC_STEP_ANALYSIS_MODEL = "together:Qwen/Qwen3.5-9B";
const MAX_ANALYSIS_FRAMES = 3;

let stepAnalysisQueue: Promise<void> = Promise.resolve();

const kitchenStepAnalysisSchema = z.object({
  performed_correctly: z.boolean().describe("Whether the visible evidence shows this protocol step was completed correctly."),
  confidence: z.number().min(0).max(1).describe("Confidence from 0 to 1 based only on the attached images."),
  summary: z.string().max(500).describe("One short human-readable sentence summarizing the evidence."),
  deviation: z.string().nullable().describe("Brief issue if the step appears wrong or ambiguous; null if no deviation is visible."),
  visible_evidence: z.array(z.string()).describe("Specific visual facts observed in the attached images."),
  missing_evidence: z.array(z.string()).describe("Specific required evidence that is missing or ambiguous."),
});

export function asyncStepAnalysisModel(env: NodeJS.ProcessEnv = process.env) {
  return env.LABOS_ASYNC_STEP_ANALYSIS_MODEL?.trim() || DEFAULT_ASYNC_STEP_ANALYSIS_MODEL;
}

function modelNameFromLabOSId(modelId: string) {
  const provider = providerIdFromModelId(modelId);
  return provider ? modelId.slice(provider.length + 1) : modelId;
}

export function isLikelyVisionModel(modelId: string) {
  const modelName = modelNameFromLabOSId(modelId);
  return heuristicModelCapabilities(modelId).vision || heuristicModelCapabilities(modelName).vision;
}

export function selectAsyncStepAnalysisModel(
  requestedModelId: string,
  loadedLmStudioModelIds: string[] = [],
) {
  if (isLikelyVisionModel(requestedModelId)) return requestedModelId;
  if (providerIdFromModelId(requestedModelId) !== "lmstudio") return requestedModelId;
  const fallback = loadedLmStudioModelIds.find((id) => isLikelyVisionModel(`lmstudio:${id}`));
  return fallback ? `lmstudio:${fallback}` : requestedModelId;
}

export async function resolveAsyncStepAnalysisModel(requestedModelId: string) {
  if (isLikelyVisionModel(requestedModelId)) return requestedModelId;
  if (providerIdFromModelId(requestedModelId) === "lmstudio") {
    const models = await fetchLmStudioModels().catch(() => []);
    const selected = selectAsyncStepAnalysisModel(requestedModelId, models.map((model) => model.id));
    if (selected !== requestedModelId) return selected;
  }
  throw new Error(
    `Async step analysis model "${requestedModelId}" does not look vision-capable. ` +
    `Use a VLM such as together:Qwen/Qwen3.5-9B, lmstudio:qwen3.5-9b-vlm, ` +
    `lmstudio:llava, or a Gemini/OpenAI vision model.`,
  );
}

function isoNow() {
  return new Date().toISOString();
}

function analysisIdForSegment(segment: KitchenStepSegment) {
  return `analysis-${segment.id}`;
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (codeBlock) return codeBlock[1];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function parseKitchenStepAnalysis(text: string): KitchenStepAnalysisDecision {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  return normalizeKitchenStepAnalysis(parsed);
}

function normalizeKitchenStepAnalysis(parsed: Record<string, unknown>): KitchenStepAnalysisDecision {
  const deviation = parsed.deviation === null || parsed.deviation === undefined
    ? null
    : String(parsed.deviation).trim() || null;
  return {
    performedCorrectly: parsed.performed_correctly === true || parsed.performedCorrectly === true,
    confidence: clampConfidence(parsed.confidence),
    summary: String(parsed.summary || parsed.reasoning || "").trim().slice(0, 500),
    deviation,
    visibleEvidence: cleanStringArray(parsed.visible_evidence ?? parsed.visibleEvidence),
    missingEvidence: cleanStringArray(parsed.missing_evidence ?? parsed.missingEvidence),
  };
}

function analysisSchemaPromptText() {
  return [
    "The response must be valid JSON matching this schema:",
    "{",
    '  "performed_correctly": boolean,',
    '  "confidence": number between 0 and 1,',
    '  "summary": string,',
    '  "deviation": string or null,',
    '  "visible_evidence": string[],',
    '  "missing_evidence": string[]',
    "}",
  ].join("\n");
}

async function loadEvidenceFrames(frameRefs: string[]) {
  const refs = frameRefs.filter(isSafeKitchenFrameRef).slice(-MAX_ANALYSIS_FRAMES);
  if (!refs.length) throw new Error("No saved frame evidence is available for this step segment");
  const frames: Array<{ ref: string; buffer: Buffer }> = [];
  for (const ref of refs) {
    const artifact = resolveKitchenArtifactRef(ref, { allowedKinds: ["frame"] });
    frames.push({ ref: artifact.ref, buffer: await fs.promises.readFile(artifact.localPath) });
  }
  return frames;
}

function promptForStep(protocolName: string, step: ProtocolStep, segment: KitchenStepSegment) {
  return [
    "You are reviewing a saved egocentric smart-glasses evidence package after a lab/kitchen protocol step was confirmed.",
    "Use only the attached image evidence. Do not assume the operator succeeded just because the button was pressed.",
    "",
    `Protocol: ${protocolName}`,
    `Step ${step.number}: ${step.instruction}`,
    `Success criteria: ${step.successCriteria}`,
    `Required visible objects: ${step.requiredObjects.join(", ") || "none listed"}`,
    step.spatialHint ? `Spatial hint: ${step.spatialHint}` : "",
    step.hazardChecks?.length ? `Hazard checks: ${step.hazardChecks.join("; ")}` : "",
    "",
    `Segment id: ${segment.id}`,
    `Attempt: ${segment.attemptNumber || 1}`,
    "",
    "Return ONLY a JSON object with this shape:",
    analysisSchemaPromptText(),
  ].filter(Boolean).join("\n");
}

function structuredProviderOptions(modelId: string) {
  const provider = providerIdFromModelId(modelId);
  return provider === "together" || provider === "runpod"
    ? { openai: { strictJsonSchema: true } }
    : undefined;
}

async function analyzeStepEvidence({
  modelId,
  content,
}: {
  modelId: string;
  content: any[];
}): Promise<{ decision: KitchenStepAnalysisDecision; rawText: string }> {
  const messages = [
    {
      role: "system" as const,
      content: [
        "You are a careful protocol adherence reviewer.",
        "Use only the attached image evidence.",
        "Return JSON only.",
        analysisSchemaPromptText(),
      ].join("\n"),
    },
    { role: "user" as const, content },
  ];

  if (usesStructuredFramePipeline(modelId)) {
    const result = await labosGenerateObject({
      modelId,
      schema: kitchenStepAnalysisSchema,
      schemaName: "kitchen_step_analysis",
      schemaDescription: "Post-run adherence decision for one saved kitchen protocol step segment.",
      messages,
      temperature: 0,
      maxOutputTokens: 700,
      providerOptions: structuredProviderOptions(modelId),
    });
    const parsed = result.object as z.infer<typeof kitchenStepAnalysisSchema>;
    return {
      decision: normalizeKitchenStepAnalysis(parsed as unknown as Record<string, unknown>),
      rawText: JSON.stringify(parsed),
    };
  }

  const result = await labosGenerateText({
    modelId,
    messages,
    temperature: 0,
    maxOutputTokens: 700,
  });
  return {
    decision: parseKitchenStepAnalysis(result.text),
    rawText: result.text,
  };
}

function eventRecord(
  segment: KitchenStepSegment,
  analysis: KitchenStepAnalysisRecord,
) {
  return appendKitchenEvent({
    type: "step_analysis",
    runId: segment.runId,
    protocolId: segment.protocolId,
    payload: { analysis },
  });
}

async function persistManifestBestEffort(runId: string) {
  try {
    await saveKitchenSessionManifest(runId);
  } catch {
    // The active run snapshot may not exist yet in some test paths. The event is still durable.
  }
}

export async function runKitchenStepSegmentAnalysis(
  segment: KitchenStepSegment,
  opts: { modelId?: string } = {},
) {
  const requestedModelId = opts.modelId || asyncStepAnalysisModel();
  const modelId = await resolveAsyncStepAnalysisModel(requestedModelId);
  const protocol = getProtocol(segment.protocolId);
  const step = protocol?.steps.find((item) => item.number === segment.stepNumber);
  const evidenceRefs = segment.frameRefs.filter(Boolean);
  const base: KitchenStepAnalysisRecord = {
    id: analysisIdForSegment(segment),
    status: "queued",
    runId: segment.runId,
    protocolId: segment.protocolId,
    segmentId: segment.id,
    attemptId: segment.attemptId,
    attemptNumber: segment.attemptNumber,
    stepNumber: segment.stepNumber,
    modelId,
    queuedAt: isoNow(),
    evidenceRefs,
  };

  await eventRecord(segment, base);
  const startedAt = Date.now();
  await eventRecord(segment, { ...base, status: "running", startedAt: isoNow() });

  try {
    if (!protocol || !step) throw new Error(`Protocol step not found for ${segment.protocolId} step ${segment.stepNumber}`);
    const frames = await loadEvidenceFrames(evidenceRefs);
    const content: any[] = [];
    for (const frame of frames) {
      content.push({ type: "image", image: frame.buffer });
    }
    content.push({ type: "text", text: promptForStep(protocol.name, step, segment) });

    const result = await analyzeStepEvidence({
      modelId,
      content,
    });
    const completed: KitchenStepAnalysisRecord = {
      ...base,
      ...result.decision,
      status: "completed",
      startedAt: new Date(startedAt).toISOString(),
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAt,
      evidenceRefs: frames.map((frame) => frame.ref),
      rawText: result.rawText.slice(0, 4000),
    };
    await eventRecord(segment, completed);
    await persistManifestBestEffort(segment.runId);
    return completed;
  } catch (error: any) {
    const failed: KitchenStepAnalysisRecord = {
      ...base,
      status: "error",
      startedAt: new Date(startedAt).toISOString(),
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
    await eventRecord(segment, failed);
    await persistManifestBestEffort(segment.runId);
    return failed;
  }
}

export function queueKitchenStepSegmentAnalysis(
  segment: KitchenStepSegment,
  opts: { modelId?: string } = {},
) {
  stepAnalysisQueue = stepAnalysisQueue
    .catch(() => {})
    .then(() => runKitchenStepSegmentAnalysis(segment, opts))
    .then(() => undefined);
  return stepAnalysisQueue;
}
