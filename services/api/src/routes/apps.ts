import { Router } from "express";
import { adb, adbShell } from "../adb.js";
import fs from "fs";
import multer from "multer";
import os from "os";
import path from "path";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();
const upload = multer({ dest: path.join(os.tmpdir(), "labos-uploads") });

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function listPackagesCommand(filter: unknown) {
  let command = "pm list packages";
  if (filter === "user") command += " -3";
  if (filter === "system") command += " -s";
  return command;
}

function parsePackageList(output: string) {
  return output
    .split("\n")
    .filter((line) => line.startsWith("package:"))
    .map((line) => line.replace("package:", "").trim())
    .sort();
}

function parsePackageDetails(packageName: string, output: string) {
  const versionMatch = output.match(/versionName=([\S]+)/);
  const versionCodeMatch = output.match(/versionCode=(\d+)/);
  const firstInstallMatch = output.match(/firstInstallTime=([\S]+)/);
  const lastUpdateMatch = output.match(/lastUpdateTime=([\S]+)/);
  const enabledMatch = output.match(/enabled=(\d+)/);

  return {
    packageName,
    versionName: versionMatch?.[1] || "unknown",
    versionCode: versionCodeMatch?.[1] || "unknown",
    firstInstall: firstInstallMatch?.[1] || "unknown",
    lastUpdate: lastUpdateMatch?.[1] || "unknown",
    enabled: enabledMatch ? enabledMatch[1] !== "2" : true,
    raw: output.substring(0, 5000),
  };
}

function readPackageNameOrThrow(value: unknown) {
  if (typeof value !== "string" || !value) {
    badRequest("packageName required");
  }
  return value;
}

function cleanupUpload(filePath: string | undefined) {
  if (filePath) {
    fs.unlink(filePath, () => {});
  }
}

function buildLaunchCommand(packageName: string, activity: unknown) {
  if (typeof activity === "string" && activity) {
    return `am start -n ${shellQuote(`${packageName}/${activity}`)}`;
  }
  return `monkey -p ${shellQuote(packageName)} -c android.intent.category.LAUNCHER 1`;
}

router.get("/", asyncRoute(async (req, res) => {
  const output = await adbShell(listPackagesCommand(req.query.filter), 30000);
  res.json({ packages: parsePackageList(output) });
}));

router.get("/:packageName", asyncRoute(async (req, res) => {
  const packageName = readPackageNameOrThrow(req.params.packageName);
  const output = await adbShell(`dumpsys package ${shellQuote(packageName)}`, 15000);
  res.json(parsePackageDetails(packageName, output));
}));

router.post("/install", upload.single("apk"), asyncRoute(async (req, res) => {
  const apkPath = req.file?.path;
  if (!apkPath) {
    badRequest("No APK file uploaded");
  }

  try {
    const output = await adb(["install", "-r", apkPath], 120000);
    res.json({ success: output.includes("Success"), output });
  } finally {
    cleanupUpload(apkPath);
  }
}));

router.post("/uninstall", asyncRoute(async (req, res) => {
  const packageName = readPackageNameOrThrow(req.body?.packageName);
  const output = await adb(["uninstall", packageName], 30000);
  res.json({ success: output.includes("Success"), output });
}));

router.post("/launch", asyncRoute(async (req, res) => {
  const packageName = readPackageNameOrThrow(req.body?.packageName);
  const output = await adbShell(buildLaunchCommand(packageName, req.body?.activity));
  res.json({ success: true, output });
}));

router.post("/stop", asyncRoute(async (req, res) => {
  const packageName = readPackageNameOrThrow(req.body?.packageName);
  const output = await adbShell(`am force-stop ${shellQuote(packageName)}`);
  res.json({ success: true, output });
}));

export default router;
