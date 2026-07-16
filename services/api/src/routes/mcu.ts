import { Router, Request, Response } from "express";
import { adbShell, adbStream } from "../adb.js";
import { asyncRoute } from "../lib/http.js";

const router = Router();
const DEFAULT_LOGCAT_COUNT = 500;
const LABOS_FILTER_RE = /LabOS/i;
const MCU_EVENT_RE = /button|press|gesture|swipe|tap|battery|batt|touch|wake|sleep/i;

interface LogEntry {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
  raw: string;
}

function parseLogLines(output: string): LogEntry[] {
  const lines = output.split("\n").filter((line) => line.trim());
  const entries: LogEntry[] = [];
  for (const line of lines) {
    // logcat format: "MM-DD HH:MM:SS.mmm L/Tag: message"
    const match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+([VDIWEFS])\/([^:]+):\s*(.*)/);
    if (match) {
      entries.push({
        timestamp: match[1].trim(),
        level: match[2],
        tag: match[3].trim(),
        message: match[4].trim(),
        raw: line,
      });
      continue;
    }

    entries.push({
      timestamp: "",
      level: "",
      tag: "",
      message: line.trim(),
      raw: line,
    });
  }
  return entries;
}

function readRequestedCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 200;
}

async function readRecentLogcat(count = DEFAULT_LOGCAT_COUNT) {
  return adbShell(`logcat -d -t ${count} -v time`, 15000);
}

function filterLogLines(output: string, predicate: (line: string) => boolean) {
  return output.split("\n").filter(predicate);
}

function parseMcuConnectionState(lines: string[]) {
  let lastState = "unknown";
  let lastTimestamp = "";

  for (const line of lines) {
    if (/MCU connected/i.test(line)) {
      lastState = "connected";
    } else if (/MCU disconnected/i.test(line)) {
      lastState = "disconnected";
    } else {
      continue;
    }

    const timestampMatch = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/);
    if (timestampMatch) lastTimestamp = timestampMatch[1];
  }

  return { state: lastState, lastTimestamp };
}

function writeSseEntry(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.get("/logs", asyncRoute(async (req, res) => {
  const lines = filterLogLines(await readRecentLogcat(readRequestedCount(req.query.count)), (line) => LABOS_FILTER_RE.test(line));
  res.json({ entries: parseLogLines(lines.join("\n")), total: lines.length });
}));

router.get("/status", asyncRoute(async (_req, res) => {
  res.json(parseMcuConnectionState((await readRecentLogcat()).split("\n")));
}));

router.get("/uart", asyncRoute(async (_req, res) => {
  const lines = filterLogLines(await readRecentLogcat(), (line) => /UART RX/i.test(line));
  res.json({ entries: parseLogLines(lines.join("\n")), total: lines.length });
}));

router.get("/events", asyncRoute(async (_req, res) => {
  const lines = filterLogLines(
    await readRecentLogcat(),
    (line) => LABOS_FILTER_RE.test(line) && MCU_EVENT_RE.test(line),
  );
  res.json({ entries: parseLogLines(lines.join("\n")), total: lines.length });
}));

router.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const kill = adbStream(
    ["logcat", "-v", "time", "LabOS:V", "*:S"],
    (line) => {
      for (const entry of parseLogLines(line)) {
        writeSseEntry(res, entry);
      }
    },
    (error) => {
      writeSseEntry(res, { error: error.message });
    },
  );

  req.on("close", () => {
    kill();
  });
});

export default router;
