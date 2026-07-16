import fs from "fs";
import { labosGenerateText } from "../labos-inference.js";
import {
  asyncStepAnalysisModel,
  resolveAsyncStepAnalysisModel,
} from "./async-step-analysis.js";
import {
  isSafeKitchenFrameRef,
  resolveKitchenArtifactRef,
} from "./artifact-refs.js";
import { getProtocol } from "./protocols.js";
import {
  readKitchenSessionManifestFile,
  writeKitchenSessionManifest,
  type KitchenStepSegment,
} from "./run-store.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import {
  buildStepVqaQuestions,
  normalizeStepVqaAnnotation,
  type StepVqaAnnotation,
} from "./vqa-annotations.js";

export interface SavedRunBoundaryAnalysisOptions {
  modelId?: string;
  window?: number;
  threshold?: number;
  forceSteps?: number[];
}

export interface SavedRunBoundaryProbe {
  id: string;
  status: "completed" | "error";
  runId: string;
  protocolId: string;
  targetStepNumber: number;
  candidateStepNumber: number;
  candidateSegmentId: string;
  offset: number;
  modelId: string;
  evidenceRefs: string[];
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  annotation?: StepVqaAnnotation;
  error?: string;
}

export interface SavedRunBoundarySuggestion {
  targetStepNumber: number;
  currentSegmentId?: string;
  currentLikelihood?: number;
  bestSegmentId?: string;
  bestSegmentStepNumber?: number;
  bestOffset?: number;
  bestLikelihood: number;
  recommendedAction: "keep_current" | "shift_boundary" | "needs_more_evidence";
  reason: string;
}

export interface SavedRunBoundaryAnalysis {
  schemaVersion: "labos.vqa.boundary-analysis.v1";
  runId: string;
  protocolId: string;
  modelId: string;
  generatedAt: string;
  threshold: number;
  window: number;
  probes: SavedRunBoundaryProbe[];
  suggestions: SavedRunBoundarySuggestion[];
}

function isoNow() {
  return new Date().toISOString();
}

function boundaryModel(env: NodeJS.ProcessEnv = process.env) {
  return env.LABOS_POST_RUN_VQA_MODEL?.trim() || asyncStepAnalysisModel(env);
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

function completedAnnotationForStep(manifest: KitchenSessionManifest, stepNumber: number) {
  return (manifest.vqaAnnotationRecords || [])
    .find((record) => record.stepNumber === stepNumber && record.status === "completed" && record.annotation)
    ?.annotation;
}

function evidenceRefsForSegment(manifest: KitchenSessionManifest, segment: KitchenStepSegment) {
  const vqaRecord = (manifest.vqaAnnotationRecords || [])
    .find((record) => record.segmentId === segment.id && record.status === "completed" && record.evidenceRefs?.length);
  const refs = [
    ...(vqaRecord?.evidenceRefs || []),
    ...(Array.isArray(segment.frameRefs) ? segment.frameRefs : []),
  ];
  return [...new Set(refs)].filter(isSafeKitchenFrameRef).slice(0, 2);
}

async function loadEvidenceFrames(frameRefs: string[]) {
  const frames: Array<{ ref: string; buffer: Buffer }> = [];
  for (const ref of frameRefs.filter(isSafeKitchenFrameRef)) {
    const artifact = resolveKitchenArtifactRef(ref, { allowedKinds: ["frame"] });
    frames.push({ ref: artifact.ref, buffer: await fs.promises.readFile(artifact.localPath) });
  }
  if (!frames.length) throw new Error("No safe frame evidence refs available for boundary probe");
  return frames;
}

function promptForBoundaryProbe(input: {
  protocolName: string;
  targetStep: { number: number; instruction: string; successCriteria?: string; requiredObjects?: string[]; spatialHint?: string };
  candidateSegment: KitchenStepSegment;
  questions: ReturnType<typeof buildStepVqaQuestions>;
}) {
  return [
    "You are auditing step-boundary alignment in a saved smart-glasses kitchen run.",
    "The attached image evidence comes from a candidate segment that may be earlier, current, or later than the target protocol step.",
    "Answer whether this candidate segment visually proves the TARGET step, not the candidate segment's original label.",
    "Use only visible evidence. If action timing is not visible, answer uncertain or no.",
    "",
    `Protocol: ${input.protocolName}`,
    `TARGET Step ${input.targetStep.number}: ${input.targetStep.instruction}`,
    input.targetStep.successCriteria ? `Target success criteria: ${input.targetStep.successCriteria}` : "",
    input.targetStep.requiredObjects?.length ? `Target required objects: ${input.targetStep.requiredObjects.join(", ")}` : "",
    input.targetStep.spatialHint ? `Target spatial hint: ${input.targetStep.spatialHint}` : "",
    "",
    `Candidate segment id: ${input.candidateSegment.id}`,
    `Candidate segment original step: ${input.candidateSegment.stepNumber}`,
    `Candidate attempt: ${input.candidateSegment.attemptNumber || 1}`,
    "",
    "Questions:",
    ...input.questions.map((question) => `- ${question.id}: ${question.question}`),
    "",
    "Return ONLY valid JSON with this schema:",
    "{",
    '  "answers": [',
    '    {"question_id": string, "question": string, "answer": "yes|no|uncertain", "confidence": number, "evidence": string[], "object_refs": string[], "blocking_issue": string|null}',
    "  ],",
    '  "frame_summary": string,',
    '  "step_complete_likelihood": number,',
    '  "recommended_next": "advance|continue|collect_more_evidence|manual_review",',
    '  "missing_evidence": string[]',
    "}",
  ].filter(Boolean).join("\n");
}

function targetStepsForBoundaryAnalysis(manifest: KitchenSessionManifest, threshold: number, forced: number[]) {
  if (forced.length) return forced;
  const stepNumbers = (manifest.steps || [])
    .map((step: any) => Number(step?.number))
    .filter((stepNumber) => Number.isFinite(stepNumber) && stepNumber > 0);
  return stepNumbers.filter((stepNumber) => {
    const annotation = completedAnnotationForStep(manifest, stepNumber);
    if (!annotation) return true;
    return annotation.recommendedNext !== "advance" || Number(annotation.stepCompleteLikelihood || 0) < threshold;
  });
}

function candidateSegmentsForTarget(manifest: KitchenSessionManifest, targetStepNumber: number, window: number) {
  return (manifest.stepSegments || [])
    .filter((segment) => Math.abs(Number(segment.stepNumber) - targetStepNumber) <= window)
    .sort((a, b) => Math.abs(a.stepNumber - targetStepNumber) - Math.abs(b.stepNumber - targetStepNumber) || a.stepNumber - b.stepNumber);
}

async function runBoundaryProbe(input: {
  manifest: KitchenSessionManifest;
  segment: KitchenStepSegment;
  targetStepNumber: number;
  modelId: string;
}): Promise<SavedRunBoundaryProbe> {
  const protocol = getProtocol(input.manifest.run.protocolId);
  const targetStep = protocol?.steps.find((step) => step.number === input.targetStepNumber);
  const startedAtMs = Date.now();
  const startedAt = isoNow();
  const base = {
    id: `boundary-step${input.targetStepNumber}-on-${input.segment.id}`,
    runId: input.manifest.run.id,
    protocolId: input.manifest.run.protocolId,
    targetStepNumber: input.targetStepNumber,
    candidateStepNumber: input.segment.stepNumber,
    candidateSegmentId: input.segment.id,
    offset: input.segment.stepNumber - input.targetStepNumber,
    modelId: input.modelId,
    evidenceRefs: evidenceRefsForSegment(input.manifest, input.segment),
    startedAt,
  };

  try {
    if (!protocol || !targetStep) throw new Error(`Protocol step not found for ${input.manifest.run.protocolId} step ${input.targetStepNumber}`);
    const questions = buildStepVqaQuestions(protocol, targetStep);
    const frames = await loadEvidenceFrames(base.evidenceRefs);
    const content: any[] = frames.map((frame) => ({ type: "image", image: frame.buffer }));
    content.push({
      type: "text",
      text: promptForBoundaryProbe({
        protocolName: protocol.name,
        targetStep,
        candidateSegment: input.segment,
        questions,
      }),
    });
    const result = await labosGenerateText({
      modelId: input.modelId,
      messages: [
        {
          role: "system" as const,
          content: "You produce strict JSON VQA boundary probes for protocol evidence. Return JSON only.",
        },
        { role: "user" as const, content },
      ],
      temperature: 0,
      maxOutputTokens: 1200,
    });
    const parsed = JSON.parse(extractJsonObject(result.text));
    const annotation = {
      ...normalizeStepVqaAnnotation({ protocol, step: targetStep, parsed, questions }),
      source: "saved-run-batch" as const,
      runId: input.manifest.run.id,
      segmentId: input.segment.id,
      attemptId: input.segment.attemptId,
      attemptNumber: input.segment.attemptNumber,
      modelId: input.modelId,
      evidenceRefs: frames.map((frame) => frame.ref),
      createdAt: isoNow(),
    };
    return {
      ...base,
      status: "completed",
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAtMs,
      annotation,
    };
  } catch (error: any) {
    return {
      ...base,
      status: "error",
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAtMs,
      error: error?.message || String(error),
    };
  }
}

function buildBoundarySuggestions(input: {
  manifest: KitchenSessionManifest;
  probes: SavedRunBoundaryProbe[];
  threshold: number;
}): SavedRunBoundarySuggestion[] {
  const byStep = new Map<number, SavedRunBoundaryProbe[]>();
  for (const probe of input.probes) {
    byStep.set(probe.targetStepNumber, [...(byStep.get(probe.targetStepNumber) || []), probe]);
  }

  return [...byStep.entries()].map(([targetStepNumber, probes]) => {
    const current = completedAnnotationForStep(input.manifest, targetStepNumber);
    const currentSegment = (input.manifest.stepSegments || []).find((segment) => segment.stepNumber === targetStepNumber);
    const completed = probes.filter((probe) => probe.status === "completed" && probe.annotation);
    const best = completed.sort((a, b) => (
      Number(b.annotation?.stepCompleteLikelihood || 0) - Number(a.annotation?.stepCompleteLikelihood || 0) ||
      Math.abs(a.offset) - Math.abs(b.offset)
    ))[0];
    const bestLikelihood = Number(best?.annotation?.stepCompleteLikelihood || 0);
    const currentLikelihood = Number(current?.stepCompleteLikelihood || 0);
    const recommendedAction: SavedRunBoundarySuggestion["recommendedAction"] = !best || bestLikelihood < input.threshold
      ? "needs_more_evidence"
      : best.offset === 0
        ? "keep_current"
        : "shift_boundary";
    const reason = recommendedAction === "shift_boundary"
      ? `Target step ${targetStepNumber} is better supported by segment step ${best.candidateStepNumber} (${bestLikelihood.toFixed(2)}) than its current segment (${currentLikelihood.toFixed(2)}).`
      : recommendedAction === "keep_current"
        ? `Target step ${targetStepNumber} is best supported by its current segment (${bestLikelihood.toFixed(2)}).`
        : `No neighboring segment reached the boundary confidence threshold (${input.threshold.toFixed(2)}).`;
    return {
      targetStepNumber,
      currentSegmentId: currentSegment?.id,
      currentLikelihood,
      bestSegmentId: best?.candidateSegmentId,
      bestSegmentStepNumber: best?.candidateStepNumber,
      bestOffset: best?.offset,
      bestLikelihood,
      recommendedAction,
      reason,
    };
  }).sort((a, b) => a.targetStepNumber - b.targetStepNumber);
}

export async function analyzeSavedKitchenSessionBoundaries(
  runId: string,
  opts: SavedRunBoundaryAnalysisOptions = {},
): Promise<SavedRunBoundaryAnalysis> {
  const manifest = await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
  const modelId = await resolveAsyncStepAnalysisModel(opts.modelId || boundaryModel());
  const threshold = Number.isFinite(Number(opts.threshold)) ? Number(opts.threshold) : 0.75;
  const window = Math.max(1, Math.min(2, Number(opts.window || 1)));
  const forced = (opts.forceSteps || []).map(Number).filter((stepNumber) => Number.isFinite(stepNumber) && stepNumber > 0);
  const targetSteps = targetStepsForBoundaryAnalysis(manifest, threshold, forced);
  const probes: SavedRunBoundaryProbe[] = [];

  for (const targetStepNumber of targetSteps) {
    for (const segment of candidateSegmentsForTarget(manifest, targetStepNumber, window)) {
      probes.push(await runBoundaryProbe({ manifest, segment, targetStepNumber, modelId }));
    }
  }

  const analysis: SavedRunBoundaryAnalysis = {
    schemaVersion: "labos.vqa.boundary-analysis.v1",
    runId,
    protocolId: manifest.run.protocolId,
    modelId,
    generatedAt: isoNow(),
    threshold,
    window,
    probes,
    suggestions: buildBoundarySuggestions({ manifest, probes, threshold }),
  };
  await writeKitchenSessionManifest(runId, {
    ...manifest,
    generatedAt: isoNow(),
    vqaBoundaryAnalysis: analysis,
  });
  return analysis;
}
