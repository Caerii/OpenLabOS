import { Router } from "express";
import { asyncRoute, badRequest } from "../lib/http.js";
import { extractButtonMappings, fetchLabosSettings, updateLabosSettings } from "../lib/labos-settings.js";

const router = Router();

const AVAILABLE_ACTIONS = [
  "take_photo",
  "toggle_video",
  "protocol_confirm_step",
  "toggle_flashlight",
  "announce_battery",
  "none",
];

router.get("/mappings", asyncRoute(async (_req, res) => {
  const settings = await fetchLabosSettings(300);
  res.json({ mappings: extractButtonMappings(settings) });
}));

router.put("/mappings", asyncRoute(async (req, res) => {
  const { mappings } = req.body || {};
  if (!mappings) badRequest("mappings required");

  const settings = await updateLabosSettings({ button_actions: mappings }, 300);
  res.json({
    success: true,
    mappings: extractButtonMappings(settings),
  });
}));

router.get("/actions", (_req, res) => {
  res.json({ actions: AVAILABLE_ACTIONS });
});

export default router;
