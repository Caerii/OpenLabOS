import {
  runLiveAnnotationSim,
  type LiveAnnotationSimProfile,
} from "../ai/kitchen/live-annotation-sim.js";

const DEFAULT_RUN_IDS = [
  "run-1777669009416-vouf",
  "run-1777671769391-z3th",
];

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseList(value: string | undefined) {
  return (value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumbers(value: string | undefined) {
  return parseList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function parsePositiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveInt(value: string | undefined) {
  const parsed = parsePositiveNumber(value);
  return parsed ? Math.floor(parsed) : undefined;
}

function parseProfile(value: string | undefined): LiveAnnotationSimProfile {
  const profile = value || "vqa-live";
  const valid = new Set([
    "success-live",
    "vqa-live",
    "multiscale-frame",
    "object-localization",
    "safety-live",
  ]);
  if (!valid.has(profile)) {
    throw new Error(`Invalid --profile "${profile}"`);
  }
  return profile as LiveAnnotationSimProfile;
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm --filter @openlabos/api kitchen:live-sim -- --profile vqa-live --fps 0.2 --max-ticks 2 --model google:gemini-robotics-er-1.6-preview",
    "",
    "Options:",
    "  --runs <ids>             Comma- or space-separated saved kitchen run ids.",
    "  --model <id>             LabOS model id. Default: google:gemini-robotics-er-1.6-preview.",
    "  --profile <name>         success-live, vqa-live, multiscale-frame, object-localization, safety-live.",
    "  --fps <n>                Simulated live sampling FPS. Default: 0.2.",
    "  --width <px>             Extracted frame width. Default: 640.",
    "  --max-ticks <n>          Max simulated ticks per segment.",
    "  --max-segments <n>       Max segments per run after step filtering.",
    "  --steps <numbers>        Optional comma-separated step numbers.",
    "  --parallel-checks        Run independent checks for one tick concurrently.",
    "  --label <text>           Label included in saved artifact filename and JSON.",
  ].join("\n"));
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const artifact = await runLiveAnnotationSim({
    runIds: parseList(argValue("--runs")).length ? parseList(argValue("--runs")) : DEFAULT_RUN_IDS,
    modelId: argValue("--model") || "google:gemini-robotics-er-1.6-preview",
    profile: parseProfile(argValue("--profile")),
    fps: parsePositiveNumber(argValue("--fps")),
    width: parsePositiveInt(argValue("--width")),
    maxTicksPerSegment: parsePositiveInt(argValue("--max-ticks")),
    maxSegmentsPerRun: parsePositiveInt(argValue("--max-segments")),
    stepNumbers: parseNumbers(argValue("--steps")),
    parallelChecks: hasArg("--parallel-checks"),
    label: argValue("--label"),
  });

  console.log(JSON.stringify({
    ok: true,
    ref: artifact.ref,
    path: artifact.path,
    elapsedMs: artifact.result.elapsedMs,
    preparationMs: artifact.result.preparationMs,
    segmentCount: artifact.result.segmentCount,
    rowCount: artifact.result.rows.length,
    summary: artifact.result.summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
