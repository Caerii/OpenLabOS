import type { KitchenProtocol, ProtocolStep } from "./protocol-types.js";
import { toClosedWorldStepId } from "./step-ids.js";

export type VqaAnswerValue = "yes" | "no" | "uncertain";
export type VqaRecommendedNext = "advance" | "continue" | "collect_more_evidence" | "manual_review";

export interface StepVqaQuestion {
  id: string;
  kind: "object_presence" | "step_completion" | "safety" | "state_read" | "evidence_quality";
  question: string;
  expectedAnswer?: VqaAnswerValue;
  required: boolean;
}

export interface StepVqaAnswer {
  questionId: string;
  question: string;
  answer: VqaAnswerValue;
  confidence: number;
  evidence: string[];
  objectRefs: string[];
  blockingIssue: string | null;
}

export interface StepVqaAnnotation {
  schemaVersion: "labos.vqa.step.v1";
  source?: "live" | "saved-run-batch";
  runId?: string;
  protocolId: string;
  stepNumber: number;
  stepId: string;
  instruction: string;
  segmentId?: string;
  attemptId?: string;
  attemptNumber?: number;
  modelId?: string;
  evidenceRefs?: string[];
  createdAt?: string;
  questions: StepVqaQuestion[];
  answers: StepVqaAnswer[];
  frameSummary: string;
  stepCompleteLikelihood: number;
  recommendedNext: VqaRecommendedNext;
  missingEvidence: string[];
}

export type StepVqaAnnotationStatus = "queued" | "running" | "completed" | "error";

export interface StepVqaAnnotationRecord {
  id: string;
  status: StepVqaAnnotationStatus;
  runId: string;
  protocolId: string;
  segmentId: string;
  attemptId?: string;
  attemptNumber?: number;
  stepNumber: number;
  modelId: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  evidenceRefs: string[];
  annotation?: StepVqaAnnotation;
  rawText?: string;
  error?: string;
}

const MAX_OBJECT_QUESTIONS = 4;

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

function cleanString(value: unknown, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanStringArray(value: unknown, maxItems = 8) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, 180)).filter(Boolean).slice(0, maxItems)
    : [];
}

function clamp01(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function answerValue(value: unknown): VqaAnswerValue {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true" || normalized === "pass") return "yes";
  if (normalized === "no" || normalized === "false" || normalized === "fail") return "no";
  return "uncertain";
}

function recommendedNext(value: unknown): VqaRecommendedNext {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "advance") return "advance";
  if (normalized === "continue") return "continue";
  if (normalized === "manual_review") return "manual_review";
  return "collect_more_evidence";
}

export function buildStepVqaQuestions(protocol: KitchenProtocol, step: ProtocolStep): StepVqaQuestion[] {
  const questions: StepVqaQuestion[] = [];
  const stepId = toClosedWorldStepId(protocol.id, step.number);

  for (const objectName of (step.requiredObjects || []).slice(0, MAX_OBJECT_QUESTIONS)) {
    questions.push({
      id: `${stepId}:object:${slug(objectName)}`,
      kind: "object_presence",
      question: `Is the required object "${objectName}" visible in the current egocentric frame?`,
      expectedAnswer: "yes",
      required: true,
    });
  }

  questions.push({
    id: `${stepId}:complete`,
    kind: "step_completion",
    question: `Does the frame show evidence that this step is complete: "${step.successCriteria || step.instruction}"?`,
    expectedAnswer: "yes",
    required: true,
  });

  if (step.hazardChecks?.length) {
    questions.push({
      id: `${stepId}:safety`,
      kind: "safety",
      question: `Is the scene free of these blocking hazards: ${step.hazardChecks.join("; ")}?`,
      expectedAnswer: "yes",
      required: true,
    });
  }

  if (step.instrumentReads?.length) {
    questions.push({
      id: `${stepId}:instrument`,
      kind: "state_read",
      question: `Can the relevant instrument, display, timer, gauge, or measuring mark be read for: ${step.instrumentReads.join("; ")}?`,
      expectedAnswer: "yes",
      required: false,
    });
  }

  questions.push({
    id: `${stepId}:view-quality`,
    kind: "evidence_quality",
    question: "Is the frame sufficiently clear and unoccluded for a reliable step judgment?",
    expectedAnswer: "yes",
    required: true,
  });

  return questions;
}

export function normalizeStepVqaAnnotation(input: {
  protocol: KitchenProtocol;
  step: ProtocolStep;
  parsed: any;
  questions?: StepVqaQuestion[];
}): StepVqaAnnotation {
  const questions = input.questions || buildStepVqaQuestions(input.protocol, input.step);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const byQuestionText = new Map(questions.map((question) => [question.question.trim().toLowerCase(), question]));
  const parsedAnswers = Array.isArray(input.parsed?.answers) ? input.parsed.answers : [];
  const answers: StepVqaAnswer[] = parsedAnswers
    .map((item: any, index: number) => {
      const rawQuestionId = cleanString(item?.question_id ?? item?.questionId ?? item?.id, 160);
      const rawText = cleanString(item?.question, 300);
      const byText = rawText ? byQuestionText.get(rawText.trim().toLowerCase()) : undefined;
      const question = byId.get(rawQuestionId) || byText || questions[index];
      const questionId = question?.id || rawQuestionId;
      const text = cleanString(item?.question || question?.question, 300);
      if (!questionId || !text) return null;
      return {
        questionId,
        question: text,
        answer: answerValue(item?.answer),
        confidence: clamp01(item?.confidence, 0),
        evidence: cleanStringArray(item?.evidence),
        objectRefs: cleanStringArray(item?.object_refs ?? item?.objectRefs),
        blockingIssue: item?.blocking_issue === null || item?.blockingIssue === null
          ? null
          : cleanString(item?.blocking_issue ?? item?.blockingIssue, 240) || null,
      } satisfies StepVqaAnswer;
    })
    .filter((item: StepVqaAnswer | null): item is StepVqaAnswer => !!item);

  const answered = new Set(answers.map((answer) => answer.questionId));
  const missingEvidence = [
    ...cleanStringArray(input.parsed?.missing_evidence ?? input.parsed?.missingEvidence),
    ...questions.filter((question) => question.required && !answered.has(question.id)).map((question) => `unanswered:${question.id}`),
  ];

  return {
    schemaVersion: "labos.vqa.step.v1",
    protocolId: input.protocol.id,
    stepNumber: input.step.number,
    stepId: toClosedWorldStepId(input.protocol.id, input.step.number),
    instruction: input.step.instruction,
    questions,
    answers,
    frameSummary: cleanString(input.parsed?.frame_summary ?? input.parsed?.frameSummary ?? input.parsed?.summary, 500),
    stepCompleteLikelihood: clamp01(input.parsed?.step_complete_likelihood ?? input.parsed?.stepCompleteLikelihood, 0),
    recommendedNext: recommendedNext(input.parsed?.recommended_next ?? input.parsed?.recommendedNext),
    missingEvidence: [...new Set(missingEvidence)].slice(0, 12),
  };
}

export function vqaAnnotationPrompt(input: {
  protocol: KitchenProtocol;
  step: ProtocolStep;
  questions?: StepVqaQuestion[];
}) {
  const questions = input.questions || buildStepVqaQuestions(input.protocol, input.step);
  return [
    "Answer the step-scoped visual questions for this smart-glasses kitchen protocol frame.",
    "Use only visible evidence in the image. Do not infer success just because the protocol expects it.",
    "If the frame is ambiguous, answer uncertain and explain what evidence is missing.",
    "For step completion and recommended_next, visible final state can be sufficient even if a required tool used earlier is no longer visible. Keep object-presence answers literal, but do not force collect_more_evidence solely because a prior tool is absent when the completed state is clear.",
    "",
    `Protocol: ${input.protocol.name} (${input.protocol.id})`,
    `Step ${input.step.number}: ${input.step.instruction}`,
    `Success criteria: ${input.step.successCriteria}`,
    input.step.requiredObjects?.length ? `Required objects: ${input.step.requiredObjects.join(", ")}` : "",
    input.step.spatialHint ? `Spatial hint: ${input.step.spatialHint}` : "",
    "",
    "Questions:",
    ...questions.map((question) => `- ${question.id}: ${question.question}`),
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
