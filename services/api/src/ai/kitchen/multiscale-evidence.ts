/**
 * Convert model results into validation evidence and aggregate evidence into a
 * deterministic step decision.
 */

import type { ProtocolStep } from "./protocol-types.js";
import type {
  MultiscaleDecision,
  MultiscaleEvidence,
  MultiscaleValidationCheck,
  StepValidationPlan,
  ValidationDecisionAction,
} from "./multiscale-types.js";

function extractLabels(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item: any) => String(item?.label || ""))
    .filter(Boolean)
    .map((label) => label.toLowerCase());
}

function missingObjects(requiredObjects: string[], parsed: unknown) {
  const labels = extractLabels(parsed);
  if (!labels.length || !requiredObjects.length) return [];
  return requiredObjects.filter((objectName) => {
    const normalized = objectName.toLowerCase();
    return !labels.some((label) => label.includes(normalized) || normalized.includes(label));
  });
}

function parsedConfidence(parsed: any, fallback = 0) {
  const value = Number(parsed?.confidence);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function evidenceFromResult(
  validationCheck: MultiscaleValidationCheck,
  result: { raw: string; parsed: any; latencyMs: number },
  step: ProtocolStep,
  artifact?: { artifactRef?: string; artifactKind?: "frame" | "video_chunk" },
): MultiscaleEvidence {
  const parsed = result.parsed || {};
  const warnings: string[] = [];
  const blockers: string[] = [];
  let passed: boolean | undefined;
  let confidence: number | undefined;

  if (validationCheck.modeId === "success-check" || validationCheck.modeId === "before-after") {
    passed = parsed.success === true;
    confidence = parsedConfidence(parsed);
  } else if (validationCheck.modeId === "teacher-judgment") {
    passed = parsed.step_complete === true;
    confidence = parsedConfidence(parsed);
    if (parsed.possible_issue) warnings.push(`teacher_issue:${parsed.possible_issue}`);
  } else if (validationCheck.modeId === "safety-check") {
    passed = parsed.overall_safe !== false;
    confidence = parsedConfidence(parsed, passed ? 0.7 : 0.9);
    const hazards = Array.isArray(parsed.hazards) ? parsed.hazards : [];
    for (const hazard of hazards) {
      const severity = String(hazard?.severity || "").toLowerCase();
      const description = String(hazard?.description || hazard?.type || "hazard");
      if (severity === "high" || severity === "medium") blockers.push(description);
      else if (description) warnings.push(description);
    }
  } else if (validationCheck.modeId === "object-pointing") {
    const missing = missingObjects(step.requiredObjects || [], parsed);
    passed = missing.length === 0;
    confidence = passed ? 0.75 : 0.35;
    warnings.push(...missing.map((item) => `missing_object:${item}`));
  } else if (validationCheck.modeId === "entity-segmentation") {
    const missing = Array.isArray(parsed?.summary?.missingPrompts) ? parsed.summary.missingPrompts : [];
    passed = missing.length === 0;
    confidence = Number.isFinite(Number(parsed?.summary?.averageConfidence))
      ? Math.max(0, Math.min(1, Number(parsed.summary.averageConfidence)))
      : passed ? 0.68 : 0.35;
    warnings.push(...missing.map((item: string) => `missing_entity:${item}`));
    if (Array.isArray(parsed?.warnings)) warnings.push(...parsed.warnings.map(String));
  }

  return {
    checkId: validationCheck.id,
    scale: validationCheck.scale,
    modeId: validationCheck.modeId,
    title: validationCheck.title,
    ok: true,
    passed,
    confidence,
    latencyMs: result.latencyMs,
    parsed,
    raw: result.raw,
    ...artifact,
    warnings,
    blockers,
  };
}

export function evidenceFromError(
  validationCheck: MultiscaleValidationCheck,
  error: unknown,
): MultiscaleEvidence {
  return {
    checkId: validationCheck.id,
    scale: validationCheck.scale,
    modeId: validationCheck.modeId,
    title: validationCheck.title,
    ok: false,
    warnings: [],
    blockers: validationCheck.required ? [`required_check_failed:${validationCheck.id}`] : [],
    error: error instanceof Error ? error.message : String(error),
  };
}

export function aggregateMultiscaleEvidence(
  plan: StepValidationPlan,
  evidence: MultiscaleEvidence[],
): MultiscaleDecision {
  const warnings = evidence.flatMap((item) => item.warnings);
  const blockers = evidence.flatMap((item) => item.blockers);
  const completionEvidence = evidence
    .filter((item) => ["success-check", "teacher-judgment", "before-after"].includes(item.modeId))
    .filter((item) => item.passed === true)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const best = completionEvidence[0];
  const hasTemporalEvidence = evidence.some((item) => item.scale === "short_chunk" && item.ok);
  const hardBlockers = plan.aggregation.blockOnUnsafeState
    ? blockers.filter((item) => !item.startsWith("required_check_failed"))
    : [];
  const enoughConfidence = (best?.confidence || 0) >= plan.aggregation.minCompletionConfidence;
  const temporalSatisfied = !plan.aggregation.requireTemporalEvidence || hasTemporalEvidence || best?.modeId === "teacher-judgment";
  const stepComplete = !!best && enoughConfidence && temporalSatisfied && hardBlockers.length === 0;

  let action: ValidationDecisionAction = "retry_frame";
  if (stepComplete) action = "advance";
  else if (plan.aggregation.requireTemporalEvidence && !hasTemporalEvidence) action = "collect_short_chunk";
  else if (hardBlockers.length > 0 || evidence.some((item) => item.ok === false && item.modeId === "success-check")) action = "manual_review";

  return {
    stepComplete,
    confidence: best?.confidence || 0,
    action,
    summary: stepComplete
      ? `Step ${plan.stepNumber} has sufficient multiscale evidence to advance.`
      : `Step ${plan.stepNumber} needs more or better evidence before advancing.`,
    supportingCheckIds: best ? [best.checkId] : [],
    warnings,
    blockers: hardBlockers,
  };
}

