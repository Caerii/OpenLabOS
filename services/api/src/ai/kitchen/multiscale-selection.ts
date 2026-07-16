/**
 * Select the subset of validation checks that can run with the evidence
 * currently available to a route or replay executor.
 */

import type { RunEROptions } from "./er-runtime.js";
import { hasBeforeAfterInputs, hasVideoChunkMetadata } from "./er-runtime.js";
import type { StepValidationPlan, ValidationInputKind, ValidationScale } from "./multiscale-types.js";

function availableInputs(opts: RunEROptions) {
  const inputs = new Set<ValidationInputKind>(["current-frame"]);
  if (opts.frameBuffer || opts.testImageUrl) inputs.add("test-image");
  if (hasBeforeAfterInputs(opts)) inputs.add("before-after");
  if (opts.videoUrl && hasVideoChunkMetadata(opts)) inputs.add("video-chunk");
  return inputs;
}

export function selectExecutableValidationChecks(
  plan: StepValidationPlan,
  opts: RunEROptions,
  scales?: ValidationScale[],
  maxChecks = 5,
) {
  const selectedScales = scales?.length ? new Set(scales) : null;
  const inputs = availableInputs(opts);
  return plan.checks
    .filter((validationCheck) => !selectedScales || selectedScales.has(validationCheck.scale))
    .filter((validationCheck) => validationCheck.inputKinds.some((kind) => inputs.has(kind)))
    .filter((validationCheck) => validationCheck.modeId !== "order-adherence" && validationCheck.modeId !== "evidence-coverage")
    .slice(0, Math.max(1, maxChecks));
}

