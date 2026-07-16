/**
 * High-frequency synchronized performance + energy trace (standalone).
 *
 * Usage:
 *   LABOS_DEVICE_IP=192.168.50.123 pnpm --filter @openlabos/api preview:trace
 *   LABOS_TRACE_DEEP=1 LABOS_TRACE_FAST_INTERVAL_MS=100 pnpm preview:trace
 *   LABOS_TRACE_DURATION_SEC=60 LABOS_TRACE_INTERVAL_MS=1000 pnpm preview:trace
 */
import path from "node:path";
import { adb, setTargetDevice } from "../adb.js";
import { runSynchronizedTrace, waitForCoulombMovement } from "../power/power-trace.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);
const DURATION_SEC = Number(process.env.LABOS_TRACE_DURATION_SEC || 60);
const INTERVAL_MS = Number(process.env.LABOS_TRACE_INTERVAL_MS || 1000);
const DEEP = process.env.LABOS_TRACE_DEEP === "1" || process.argv.includes("--deep");
const FAST_MS = Number(process.env.LABOS_TRACE_FAST_INTERVAL_MS || 100);
const FULL_MS = Number(process.env.LABOS_TRACE_FULL_INTERVAL_MS || 2000);
const LABEL = process.env.LABOS_TRACE_LABEL || "preview-trace";

async function main() {
  await adb(["connect", SERIAL], 15_000);
  setTargetDevice(SERIAL);
  await adb(["forward", `tcp:${PREVIEW_PORT}`, "tcp:8089"], 10_000);

  if (process.argv.includes("--wait-coulomb")) {
    const gate = await waitForCoulombMovement({ timeoutSec: 120 });
    console.log("[preview-trace] coulomb-gate", gate);
  }

  const outDir = path.resolve(process.cwd(), "artifacts", "preview-traces");
  const outPath = path.join(outDir, `${LABEL}-${Date.now()}.jsonl`);

  const { summary, outPath: written } = await runSynchronizedTrace({
    label: LABEL,
    durationSec: DURATION_SEC,
    intervalMs: INTERVAL_MS,
    deep: DEEP,
    fastIntervalMs: FAST_MS,
    fullIntervalMs: FULL_MS,
    previewPort: PREVIEW_PORT,
    cpuEveryNTicks: DEEP ? 1 : Math.max(1, Math.round(5000 / INTERVAL_MS)),
    outPath,
    onSample: (s) => {
      const logFull = s.tier === "full" && (s.tick % 5 === 0 || s.tick === 1);
      const logFast = DEEP && s.tier === "fast" && s.tick % 10 === 0;
      if (!logFull && !logFast) return;
      console.log(
        `[preview-trace] tick=${s.tick} tier=${s.tier} sync=${s.syncSkewMs}ms ` +
          `soc=${s.battery.socFractionalPercent}% mw=${s.battery.instantaneousMw} ` +
          `thermal=${s.sysfsThermalCpuC ?? s.thermal?.cpuC}°C ` +
          (s.pipeline
            ? `fps=${s.pipeline.fps} rec=${s.pipeline.recording} gov=${s.pipeline.thermalGovernorCappedFps}`
            : ""),
      );
    },
  });

  console.log(JSON.stringify({ outPath: written, deep: DEEP, summary }, null, 2));
}

main().catch((error) => {
  console.error("[preview-trace] failed", error);
  process.exit(1);
});
