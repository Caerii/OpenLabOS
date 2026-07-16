import fs from "node:fs/promises";
import path from "node:path";
import { replayFixtureFromSessionManifest, type KitchenSessionManifest } from "../ai/kitchen/index.js";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const manifestPath = arg("--manifest");
  const outPath = arg("--out");
  const fixtureId = arg("--fixture-id");
  if (!manifestPath || !outPath) {
    throw new Error("Usage: tsx src/server/scripts/build-kitchen-replay-fixture.ts --manifest <manifest.json> --out <fixture.json> [--fixture-id <id>]");
  }

  const manifestFile = path.resolve(manifestPath);
  const outFile = path.resolve(outPath);
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf-8")) as KitchenSessionManifest;
  const fixture = replayFixtureFromSessionManifest(manifest, {
    fixtureId,
    manifestRef: path.relative(process.cwd(), manifestFile).replace(/\\/g, "/"),
  });

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(fixture, null, 2), "utf-8");
  console.log(`Wrote ${outFile}`);
  console.log(`Replay ticks: ${fixture.ticks.length}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
