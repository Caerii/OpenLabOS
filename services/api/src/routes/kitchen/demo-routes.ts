import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { listKitchenDemoSamples, resolveKitchenDemoSampleAsset } from "../../ai/kitchen/demo-samples.js";
import { asyncRoute } from "../../lib/http.js";

export function registerKitchenDemoRoutes(router: Router) {
  router.get("/demo/samples", asyncRoute(async (req, res) => {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 48;
    res.json(await listKitchenDemoSamples(Number.isFinite(limit) ? limit : 48));
  }));

  router.get("/demo/samples/:sampleId/clip", asyncRoute(async (req, res) => {
    const filePath = await resolveKitchenDemoSampleAsset(req.params.sampleId, { type: "clip" });
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "demo clip not found" });
      return;
    }
    res.type("video/mp4");
    res.sendFile(path.resolve(filePath));
  }));

  router.get("/demo/samples/:sampleId/frames/:index", asyncRoute(async (req, res) => {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index > 256) {
      res.status(400).json({ error: "invalid frame index" });
      return;
    }
    const filePath = await resolveKitchenDemoSampleAsset(req.params.sampleId, { type: "frame", index });
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "demo frame not found" });
      return;
    }
    res.type("image/jpeg");
    res.sendFile(path.resolve(filePath));
  }));
}
