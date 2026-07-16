/**
 * Emits JSON Schema for every public top-level Zod schema. The Python services
 * regenerate Pydantic models from these files during `uv sync`, so they are
 * the single source of truth across the polyglot monorepo.
 *
 * Run: `pnpm --filter @openlabos/protocol schema:emit`
 * Output: `packages/protocol/schema/<name>.schema.json`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";

import { JudgmentSchema } from "../src/judgment.js";
import { ProtocolSchema } from "../src/protocol.js";
import { RunManifestSchema } from "../src/run.js";
import { SessionEventSchema, SessionSchema } from "../src/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "schema");
mkdirSync(outDir, { recursive: true });

const targets: Record<string, unknown> = {
  protocol: ProtocolSchema,
  session: SessionSchema,
  "session-event": SessionEventSchema,
  judgment: JudgmentSchema,
  "run-manifest": RunManifestSchema,
};

for (const [name, schema] of Object.entries(targets)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = zodToJsonSchema(schema as any, { name, target: "jsonSchema7" });
  const path = resolve(outDir, `${name}.schema.json`);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log(`wrote ${path}`);
}
