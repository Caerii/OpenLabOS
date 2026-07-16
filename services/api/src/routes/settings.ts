import { Router } from "express";
import { asyncRoute, badRequest } from "../lib/http.js";
import { fetchLabosSettings, updateLabosSettings } from "../lib/labos-settings.js";

const router = Router();

router.get("/", asyncRoute(async (_req, res) => {
  res.json(await fetchLabosSettings());
}));

router.put("/", asyncRoute(async (req, res) => {
  const updates = req.body;
  if (!updates || Object.keys(updates).length === 0) {
    badRequest("No settings provided");
  }

  const settings = await updateLabosSettings(updates);
  res.json({ success: true, settings });
}));

export default router;
