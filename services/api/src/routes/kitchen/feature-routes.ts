import { Router } from "express";
import { getLabOSFeatureConfig } from "../../config/features.js";
import { asyncRoute } from "../../lib/http.js";
import { kitchenButtonConfirmStatus } from "./button-confirm-bridge.js";
import { kitchenOperatorReadiness } from "./operator-readiness-adapter.js";

export function registerKitchenFeatureRoutes(router: Router) {
  router.get("/features", (_req, res) => {
    res.json(getLabOSFeatureConfig());
  });

  router.get("/button-confirm/status", asyncRoute(async (_req, res) => {
    res.json(await kitchenButtonConfirmStatus());
  }));

  router.get("/operator-readiness", asyncRoute(async (_req, res) => {
    res.json(await kitchenOperatorReadiness());
  }));
}
