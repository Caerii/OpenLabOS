import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type TestSuite = "offline" | "device" | "live" | "all";

type TestCase = {
  file: string;
  suite: Exclude<TestSuite, "all">;
};

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function suiteForFile(file: string): Exclude<TestSuite, "all"> | null {
  const name = path.basename(file);
  if (name.endsWith(".manual.ts") || name.includes(".live.")) return "live";
  if (name.includes(".device.")) return "device";
  if (name.endsWith(".test.ts")) return "offline";
  return null;
}

function discoverTests(): TestCase[] {
  return ["src/tests"]
    .flatMap(walk)
    .map((file) => file.replaceAll(path.sep, "/"))
    .map((file) => ({ file, suite: suiteForFile(file) }))
    .filter((test): test is TestCase => test.suite !== null)
    .sort((a, b) => a.file.localeCompare(b.file));
}

const TESTS = discoverTests();

function suiteFromArg(value: string | undefined): TestSuite {
  if (value === "all" || value === "device" || value === "live" || value === "offline") return value;
  return "offline";
}

function testsForSuite(suite: TestSuite) {
  if (suite === "all") return TESTS.filter((test) => test.suite !== "live");
  return TESTS.filter((test) => test.suite === suite);
}

function main() {
  const suite = suiteFromArg(process.argv[2]);
  const tests = testsForSuite(suite);
  if (!tests.length) {
    console.log(`[tests] no ${suite} OpenLabOS API tests are registered yet`);
    return;
  }

  console.log(`[tests] running ${tests.length} ${suite} OpenLabOS API test file(s)`);
  const runner = "pnpm";
  const started = Date.now();

  for (const test of tests) {
    console.log(`\n[tests] ${test.file}`);
    const result = spawnSync(runner, ["exec", "tsx", test.file], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        LABOS_TEST_SUITE: suite,
      },
    });
    if (result.error) {
      console.error(`[tests] failed to spawn ${runner}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[tests] ${suite} suite passed in ${elapsed}s`);
}

main();
