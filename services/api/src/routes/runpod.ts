import { Router } from "express";
import {
  buildRunPodCostGuardStatus,
  loadRunPodCostGuardConfig,
  stopRunPodPod,
} from "../ai/runpod/cost-guard.js";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();

router.get("/guard", (_req, res) => {
  res.json(buildRunPodCostGuardStatus());
});

router.post("/stop", asyncRoute(async (req, res) => {
  if (req.body?.confirm !== "stop-paid-gpu") {
    badRequest('Refusing to stop RunPod without confirm: "stop-paid-gpu"');
  }

  const result = await stopRunPodPod(loadRunPodCostGuardConfig());
  res.json(result);
}));

export default router;

