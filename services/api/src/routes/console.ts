import { Router, Request, Response } from "express";
import { adbShell, adbStream } from "../adb.js";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LOG_PATH = "/sdcard/LabOS/.mcu_console.log";
const MCU_CONSOLE_ACTION = "com.openlab.labos.ACTION_MCU_CONSOLE";
const MCU_CONSOLE_PACKAGE = "com.openlab.labos.core";

function escapeSingleQuotedShellArg(value: string) {
  return value.replace(/'/g, "'\\''");
}

function writeSseEntry(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readConsoleTail(lines = 200) {
  const output = await adbShell(`tail -${lines} ${LOG_PATH}`, 10000);
  return output.split("\n").filter((line) => line.length > 0);
}

async function sendConsoleCommand(command: string) {
  const escaped = escapeSingleQuotedShellArg(command);
  await adbShell(
    `am broadcast -a ${MCU_CONSOLE_ACTION} --es command '${escaped}' ${MCU_CONSOLE_PACKAGE}`,
    10000,
  );
}

router.post("/send", asyncRoute(async (req, res) => {
  const command = typeof req.body?.command === "string" ? req.body.command : "";
  if (!command) {
    badRequest("command required");
  }

  await sendConsoleCommand(command);
  await sleep(500);
  res.json({ success: true, lines: await readConsoleTail(5) });
}));

router.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const kill = adbStream(
    ["shell", "tail", "-f", LOG_PATH],
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

router.get("/history", asyncRoute(async (_req, res) => {
  res.json({ lines: await readConsoleTail() });
}));

router.post("/clear", asyncRoute(async (_req, res) => {
  await adbShell(`echo -n > ${LOG_PATH}`, 5000);
  res.json({ success: true });
}));

export default router;
