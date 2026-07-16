import { Router } from "express";
import {
  buildProtocolMultiscalePlan,
} from "../../ai/kitchen/multiscale-validation.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { executeStepMultiscaleValidation } from "./multiscale-executor.js";
import { getProtocolOrThrow } from "./shared.js";

export function registerKitchenValidationRoutes(router: Router) {
  router.get("/validation/plan/:protocolId", asyncRoute(async (req, res) => {
    const protocol = getProtocolOrThrow(req.params.protocolId);
    const stepNumber = typeof req.query.stepNumber === "string" ? Number(req.query.stepNumber) : undefined;
    if (stepNumber !== undefined && (!Number.isFinite(stepNumber) || stepNumber <= 0)) {
      badRequest("stepNumber must be a positive number");
    }

    const plan = buildProtocolMultiscalePlan(protocol);
    res.json(stepNumber
      ? {
          ...plan,
          stepPlans: plan.stepPlans.filter((stepPlan) => stepPlan.stepNumber === stepNumber),
        }
      : plan);
  }));

  router.post("/validation/step", asyncRoute(async (req, res) => {
    const { protocolId, stepNumber } = req.body || {};
    if (!protocolId) badRequest("protocolId is required");
    if (!Number.isFinite(stepNumber) || stepNumber <= 0) badRequest("stepNumber is required");

    const { plan, selectedChecks, evidence, decision } = await executeStepMultiscaleValidation({
      protocolId,
      stepNumber: Number(stepNumber),
      body: req.body,
    });
    res.json({
      success: evidence.some((item) => item.ok),
      plan,
      selectedChecks,
      evidence,
      decision,
    });
  }));
}
