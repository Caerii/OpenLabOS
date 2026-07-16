import { Router } from "express";
import { adbShell } from "../adb.js";
import { asyncRoute } from "../lib/http.js";

const router = Router();

const LOG_PATH = "/sdcard/LabOS/.battery_log.csv";

interface BatteryEntry {
  timestamp: number;
  percentage: number;
  voltage: number;
}

function parseCSV(raw: string): BatteryEntry[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [ts, pct, volt] = line.split(",");
      return {
        timestamp: parseInt(ts, 10),
        percentage: parseInt(pct, 10),
        voltage: parseFloat(volt),
      };
    })
    .filter((entry) => !isNaN(entry.timestamp) && !isNaN(entry.percentage));
}

async function readBatteryHistory() {
  return parseCSV(await adbShell(`cat ${LOG_PATH}`, 10000));
}

function filterHistoryByHours(history: BatteryEntry[], hours: unknown) {
  const parsedHours = typeof hours === "string" ? parseInt(hours, 10) : NaN;
  if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
    return history;
  }

  const cutoff = Date.now() - parsedHours * 60 * 60 * 1000;
  return history.filter((entry) => entry.timestamp >= cutoff);
}

function summarizeBatteryHistory(history: BatteryEntry[]) {
  if (history.length < 2) {
    return {
      avgDrainPerHour: null,
      estimatedMinutesLeft: null,
      minPct24h: null,
      maxPct24h: null,
      sampleCount: history.length,
    };
  }

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const recent24h = history.filter((entry) => entry.timestamp >= cutoff24h);
  const first = history[0];
  const last = history[history.length - 1];
  const hoursSpan = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
  const drain = first.percentage - last.percentage;
  const avgDrainPerHour = hoursSpan > 0 ? Math.round((drain / hoursSpan) * 100) / 100 : 0;
  const recentPercentages = recent24h.map((entry) => entry.percentage);

  return {
    avgDrainPerHour,
    estimatedMinutesLeft: avgDrainPerHour > 0 ? Math.round((last.percentage / avgDrainPerHour) * 60) : null,
    minPct24h: recentPercentages.length > 0 ? Math.min(...recentPercentages) : null,
    maxPct24h: recentPercentages.length > 0 ? Math.max(...recentPercentages) : null,
    sampleCount: history.length,
  };
}

router.get("/history", asyncRoute(async (req, res) => {
  const history = filterHistoryByHours(await readBatteryHistory(), req.query.hours);
  const last = history.length > 0 ? history[history.length - 1] : null;

  res.json({
    history,
    currentPercentage: last?.percentage ?? null,
    currentVoltage: last?.voltage ?? null,
  });
}));

router.get("/summary", asyncRoute(async (_req, res) => {
  res.json(summarizeBatteryHistory(await readBatteryHistory()));
}));

router.delete("/history", asyncRoute(async (_req, res) => {
  await adbShell(`echo -n > ${LOG_PATH}`, 5000);
  res.json({ success: true });
}));

export default router;
