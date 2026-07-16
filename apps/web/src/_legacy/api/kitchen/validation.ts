/**
 * Multiscale validation planning and execution calls.
 */

import { kitchenGet, kitchenPost } from "./transport";
import type { ERInputOptions, MultiscaleValidationResult, ProtocolMultiscalePlan, ValidationScale } from "./types";

export const kitchenValidationPlan = (protocolId: string, stepNumber?: number) =>
  kitchenGet<ProtocolMultiscalePlan>(
    `validation/plan/${encodeURIComponent(protocolId)}${stepNumber ? `?stepNumber=${stepNumber}` : ""}`,
  );

export const kitchenMultiscaleStepValidation = (opts: {
  protocolId: string;
  stepNumber: number;
  scales?: ValidationScale[];
  maxChecks?: number;
} & ERInputOptions) => kitchenPost<MultiscaleValidationResult>("validation/step", opts);

