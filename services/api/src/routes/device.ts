import { Router } from "express";
import {
  adb,
  getDeviceInfo,
  getDeviceStatus,
  getTargetDevice,
  listDevices,
  scanForDevices,
  setTargetDevice,
} from "../adb.js";
import { asyncRoute, badRequest } from "../lib/http.js";
import { enableWifiProxy } from "../wifi-proxy.js";

const router = Router();

function readIpOrThrow(value: unknown) {
  if (typeof value !== "string" || !value) {
    badRequest("IP address required");
  }
  return value;
}

function findOnlineDeviceOrThrow(serial: string, devices: Awaited<ReturnType<typeof listDevices>>) {
  const found = devices.find((device) => device.serial === serial && device.status === "device");
  if (!found) {
    badRequest(`Device ${serial} not found or not online`);
  }
  return found;
}

router.get("/status", asyncRoute(async (_req, res) => {
  res.json(await getDeviceStatus());
}));

// List all connected ADB devices
router.get("/list", asyncRoute(async (_req, res) => {
  res.json({ devices: await listDevices(), targetDevice: getTargetDevice() });
}));

// Select a specific device by serial
router.post("/select", asyncRoute(async (req, res) => {
  const serial = typeof req.body?.serial === "string" ? req.body.serial : "";
  if (!serial) {
    setTargetDevice(null);
    res.json({ success: true, targetDevice: null });
    return;
  }

  const found = findOnlineDeviceOrThrow(serial, await listDevices());
  setTargetDevice(serial);
  res.json({ success: true, targetDevice: serial, model: found.model });
}));

router.post("/connect", asyncRoute(async (req, res) => {
  const ip = readIpOrThrow(req.body?.ip);
  let wifiResult: Awaited<ReturnType<typeof enableWifiProxy>> | null = null;
  let adbOutput: string | null = null;
  let adbError: string | null = null;

  try {
    wifiResult = await enableWifiProxy(ip, typeof req.body?.token === "string" ? req.body.token : null);
  } catch {
    // ADB can still be valid for a USB or tcpip-only workflow, so keep going.
  }

  try {
    adbOutput = await adb(["connect", `${ip}:5555`], 10000);
  } catch (error: any) {
    adbError = error?.message || String(error);
  }

  const adbConnected = !!adbOutput && /connected|already connected/i.test(adbOutput);
  if (wifiResult || adbConnected) {
    if (adbConnected) setTargetDevice(`${ip}:5555`);
    res.json({
      success: true,
      mode: wifiResult ? "wifi" : "adb",
      output: adbOutput || `WiFi proxy connected to ${ip}`,
      adbError,
      wifi: wifiResult ? { ip: wifiResult.ip, mode: wifiResult.mode, token: wifiResult.token } : null,
    });
    return;
  }

  res.status(502).json({
    success: false,
    error: adbError || `Could not connect to glasses at ${ip}`,
    output: adbOutput || "",
  });
}));

router.post("/disconnect", asyncRoute(async (_req, res) => {
  const output = await adb(["disconnect"]);
  setTargetDevice(null);
  res.json({ success: true, output });
}));

router.get("/info", asyncRoute(async (_req, res) => {
  res.json(await getDeviceInfo());
}));

router.post("/scan", asyncRoute(async (_req, res) => {
  res.json({ devices: await scanForDevices() });
}));

export default router;
