import { Router } from "express";
import {
  getBatteryDetails,
  getCpuDetails,
  getDisplayInfo,
  getHardwareOverview,
  getMemoryInfo,
  getSensorSummary,
  getStorageInfo,
  getThermalInfo,
} from "../lib/device-hardware.js";
import { asyncRoute } from "../lib/http.js";

const router = Router();

router.get("/battery", asyncRoute(async (_req, res) => {
  res.json(await getBatteryDetails());
}));

router.get("/memory", asyncRoute(async (_req, res) => {
  res.json(await getMemoryInfo());
}));

router.get("/cpu", asyncRoute(async (_req, res) => {
  res.json(await getCpuDetails());
}));

router.get("/storage", asyncRoute(async (_req, res) => {
  res.json(await getStorageInfo());
}));

router.get("/thermal", asyncRoute(async (_req, res) => {
  res.json(await getThermalInfo());
}));

router.get("/display", asyncRoute(async (_req, res) => {
  res.json(await getDisplayInfo());
}));

router.get("/sensors", asyncRoute(async (_req, res) => {
  res.json(await getSensorSummary());
}));

router.get("/overview", asyncRoute(async (_req, res) => {
  res.json(await getHardwareOverview());
}));

export default router;
