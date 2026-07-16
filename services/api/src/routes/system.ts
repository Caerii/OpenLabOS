import { Router, Request, Response } from "express";
import { adb, adbShell, adbStream } from "../adb.js";
import fs from "fs";
import os from "os";
import path from "path";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();

const SCREENSHOT_DEVICE_PATH = "/sdcard/screenshot_tmp.png";

function writeSseEntry(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function cleanupFile(filePath: string) {
  fs.unlink(filePath, () => {});
}

async function captureScreenshotToTempFile() {
  const tmpFile = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
  await adbShell(`screencap -p ${SCREENSHOT_DEVICE_PATH}`, 10000);
  await adb(["pull", SCREENSHOT_DEVICE_PATH, tmpFile], 10000);
  await adbShell(`rm ${SCREENSHOT_DEVICE_PATH}`).catch(() => {});
  return tmpFile;
}

function readShellCommandOrThrow(value: unknown) {
  if (typeof value !== "string" || !value) {
    badRequest("command required");
  }
  return value;
}

function readLogcatTag(value: unknown) {
  return typeof value === "string" && value ? value : "LabOS";
}

router.post("/reboot", asyncRoute(async (_req, res) => {
  const output = await adb(["reboot"]);
  res.json({ success: true, output });
}));

router.get("/logcat", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const kill = adbStream(
    ["logcat", "-v", "time", `${readLogcatTag(req.query.tag)}:V`, "*:S"],
    (line) => {
      writeSseEntry(res, { line });
    },
    (error) => {
      writeSseEntry(res, { error: error.message });
    },
  );

  req.on("close", () => {
    kill();
  });
});

router.post("/screenshot", asyncRoute(async (_req, res) => {
  const tmpFile = await captureScreenshotToTempFile();
  res.sendFile(tmpFile, () => {
    cleanupFile(tmpFile);
  });
}));

router.post("/shell", asyncRoute(async (req, res) => {
  res.json({ output: await adbShell(readShellCommandOrThrow(req.body?.command), 30000) });
}));

export default router;
