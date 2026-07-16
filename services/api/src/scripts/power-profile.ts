import {
  CAPTURE_DENSITY_PROFILES,
  runPowerProfile,
  type CaptureDensity,
} from "../power/power-profiler.js";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseNumber(name: string, defaultValue: number) {
  const parsed = Number(argValue(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseDensity(): CaptureDensity | null {
  const value = argValue("--density");
  if (!value) return null;
  if (value === "low" || value === "balanced" || value === "high") return value;
  throw new Error(`Unknown --density "${value}". Use low, balanced, or high.`);
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm --filter @openlabos/api power:profile -- --label baseline --duration 60 --interval 5",
    "  pnpm --filter @openlabos/api power:profile -- --density balanced --label balanced-preview --duration 120",
    "",
    "Options:",
    "  --label <name>       Label for output files.",
    "  --duration <sec>     Sampling duration. Default: 60.",
    "  --interval <sec>     Sampling interval. Default: 5.",
    "  --density <profile>  Optional capture density to apply first: low, balanced, high.",
    "",
    "Density profiles:",
    JSON.stringify(CAPTURE_DENSITY_PROFILES, null, 2),
  ].join("\n"));
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const density = parseDensity();
  const label = argValue("--label") || density || "power-profile";
  const durationSec = parseNumber("--duration", 60);
  const intervalSec = parseNumber("--interval", 5);
  const { outPath, summary } = await runPowerProfile({
    label,
    durationSec,
    intervalSec,
    density,
  });

  console.log(JSON.stringify({ outPath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
