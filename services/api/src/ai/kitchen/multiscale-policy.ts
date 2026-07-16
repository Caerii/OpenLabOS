/**
 * Pure policy helpers for constructing multiscale validation plans.
 */

import type { ProtocolStep } from "./protocol-types.js";
import type { MultiscaleValidationCheck, ValidationInputKind, ValidationScale } from "./multiscale-types.js";

export const DEFAULT_MULTISCALE_POLICY = {
  frameSampleFps: 1,
  defaultVideoFps: 2,
  shortChunkSeconds: 4,
  stepWindowSeconds: 20,
  minPassesToAdvance: 2,
  minCompletionConfidence: 0.6,
};

const TEMPORAL_ACTION_RE = /\b(add|baste|cut|fill|flip|insert|layer|mix|move|place|pour|remove|scoop|slice|spread|stir|transfer|turn|whisk)\b/i;
const LIQUID_RE = /\b(fill|liquid|ml|mug|pour|water|level|cup|kettle|bowl)\b/i;
const INSTRUMENT_RE = /\b(display|gauge|line|marking|measurement|thermometer|timer|temperature|dial)\b/i;

export function validationCheck(
  id: string,
  scale: ValidationScale,
  modeId: string,
  title: string,
  purpose: string,
  trigger: string,
  inputKinds: ValidationInputKind[],
  priority: number,
  required = false,
  cadenceMs?: number,
): MultiscaleValidationCheck {
  return { id, scale, modeId, title, purpose, trigger, inputKinds, priority, required, cadenceMs };
}

function stepText(step: ProtocolStep) {
  return `${step.instruction} ${step.successCriteria} ${step.verificationPrompt} ${(step.requiredObjects || []).join(" ")}`;
}

export function needsTemporalEvidence(step: ProtocolStep) {
  return TEMPORAL_ACTION_RE.test(stepText(step));
}

export function needsLiquidEvidence(step: ProtocolStep) {
  return LIQUID_RE.test(stepText(step));
}

export function needsInstrumentEvidence(step: ProtocolStep) {
  return !!step.instrumentReads?.length || INSTRUMENT_RE.test(stepText(step));
}

export function primaryLiquidContainer(step: ProtocolStep) {
  const objects = step.requiredObjects || [];
  return (
    objects.find((item) => /\b(measuring cup|cup|mug|bowl|kettle|pot)\b/i.test(item)) ||
    "target container"
  );
}

