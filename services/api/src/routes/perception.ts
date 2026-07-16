import { Router } from "express";
import { buildPerceptionRuntimeStatus } from "../ai/perception/runtimes.js";

const router = Router();

router.get("/runtime", (_req, res) => {
  res.json(buildPerceptionRuntimeStatus());
});

export default router;
