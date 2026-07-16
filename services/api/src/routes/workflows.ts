import { Router } from "express";
import {
  defaultWorkflowPreset,
  listWorkflowPresets,
  workflowPresetForProtocol,
} from "../ai/workflows/index.js";

const router = Router();

router.get("/", (_req, res) => {
  const presets = listWorkflowPresets();
  res.json({
    presets,
    defaultPresetId: defaultWorkflowPreset().id,
  });
});

router.get("/default", (_req, res) => {
  res.json(defaultWorkflowPreset());
});

router.get("/by-protocol/:protocolId", (req, res) => {
  res.json(workflowPresetForProtocol(req.params.protocolId));
});

export default router;
