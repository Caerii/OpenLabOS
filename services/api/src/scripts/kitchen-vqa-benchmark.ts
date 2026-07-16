import { loadProvidersFromEnv } from "../ai/providers.js";
import { runSavedRunVqaBenchmark } from "../ai/kitchen/vqa-benchmark.js";

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
  const values = parseList(value).map((item) => Number(item));
  return values.filter((item) => Number.isFinite(item) && item > 0);
}

function parsePositiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm --filter @openlabos/api kitchen:vqa:benchmark -- --models lmstudio:qwen3.5-9b-vlm,together:Qwen/Qwen3.5-9B",
    "",
    "Options:",
    "  --runs <ids>             Comma-separated saved kitchen run ids. Defaults to the known non-desk kitchen runs.",
    "  --models <ids>           Comma-separated LabOS VQA model ids. Required.",
    "  --steps <numbers>        Optional comma-separated step numbers.",
    "  --max-segments <n>       Optional max segments per run after step filtering.",
    "  --concurrent <n>         Override per-model concurrency. Default uses provider strategy.",
    "  --label <text>           Label included in the saved benchmark filename and JSON.",
  ].join("\n"));
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  loadProvidersFromEnv();

  const modelIds = parseList(argValue("--models"));
  if (!modelIds.length) {
    printHelp();
    throw new Error("Pass at least one model with --models");
  }

  const artifact = await runSavedRunVqaBenchmark({
    runIds: parseList(argValue("--runs")).length ? parseList(argValue("--runs")) : DEFAULT_RUN_IDS,
    modelIds,
    stepNumbers: parseNumbers(argValue("--steps")),
    maxSegmentsPerRun: parsePositiveInt(argValue("--max-segments")),
    concurrent: parsePositiveInt(argValue("--concurrent")),
    label: argValue("--label"),
  });

  console.log(JSON.stringify({
    ok: true,
    ref: artifact.ref,
    path: artifact.path,
    elapsedMs: artifact.result.elapsedMs,
    rowsPerMinute: artifact.result.rowsPerMinute,
    effectiveConcurrencyByModel: artifact.result.effectiveConcurrencyByModel,
    rowCount: artifact.result.rows.length,
    summaries: artifact.result.summaries,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
