import { Router } from "express";
import { adb, adbShell } from "../adb.js";
import fs from "fs";
import multer from "multer";
import os from "os";
import path from "path";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();
const upload = multer({ dest: path.join(os.tmpdir(), "labos-uploads") });

const LABOS_CORE_PACKAGE = "com.openlab.labos.core";

function parseCurrentVersion(output: string) {
  return {
    versionName: output.match(/versionName=([\S]+)/)?.[1] || "unknown",
    versionCode: output.match(/versionCode=(\d+)/)?.[1] || "unknown",
  };
}

function readTempPathOrThrow(value: unknown) {
  if (typeof value !== "string" || !value) {
    badRequest("tempPath required");
  }
  return value;
}

function cleanupFile(filePath: string) {
  fs.unlink(filePath, () => {});
}

router.get("/current", asyncRoute(async (_req, res) => {
  const output = await adbShell(`dumpsys package ${LABOS_CORE_PACKAGE}`, 15000);
  res.json(parseCurrentVersion(output));
}));

router.post("/upload", upload.single("apk"), asyncRoute(async (req, res) => {
  if (!req.file) {
    badRequest("No APK file uploaded");
  }

  res.json({
    filename: req.file.originalname,
    size: req.file.size,
    tempPath: req.file.path,
  });
}));

router.post("/install", asyncRoute(async (req, res) => {
  const tempPath = readTempPathOrThrow(req.body?.tempPath);
  const output = await adb(["install", "-r", tempPath], 120000);

  cleanupFile(tempPath);
  res.json({ success: output.includes("Success"), output });
}));

export default router;
