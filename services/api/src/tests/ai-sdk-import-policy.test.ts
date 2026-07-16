/**
 * Verifies provider-agnostic inference boundary:
 * - Value imports from `ai` only in `labos-inference.ts` (+ `import type` elsewhere).
 * - `@google/genai` only under `live-coach/` (Gemini Live — no AI SDK equivalent).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = path.join(__dirname, "..");

function listTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      listTsFiles(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function norm(p: string) {
  return p.replace(/\\/g, "/");
}

function testAiPackageImportsScoped() {
  const files = listTsFiles(SERVER_SRC);
  const aiFromViolations: string[] = [];
  const genaiViolations: string[] = [];

  for (const abs of files) {
    const rel = norm(path.relative(SERVER_SRC, abs));
    const text = fs.readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith("//")) continue;
      if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) continue;

      const mentionsAiPkg =
        (t.includes(`from "ai"`) || t.includes(`from 'ai'`)) && /\bimport\b/.test(t);
      if (mentionsAiPkg) {
        if (/\bimport\s+type\b/.test(t)) continue;
        if (rel.endsWith("ai/labos-inference.ts")) continue;
        aiFromViolations.push(`${rel}:${i + 1}: ${t}`);
      }

      const mentionsGenai =
        (t.includes(`from "@google/genai"`) || t.includes(`from '@google/genai'`)) && /\bimport\b/.test(t);
      const allowedGenaiImport =
        rel === "ai/google-genai-client.ts" ||
        rel.includes("live-coach/") ||
        rel === "ai/kitchen/gemini-video-upload.ts";
      if (mentionsGenai && !allowedGenaiImport) {
        genaiViolations.push(`${rel}:${i + 1}: ${t}`);
      }
    }
  }

  assert.deepEqual(
    aiFromViolations,
    [],
    `Non-type imports from "ai" must only live in ai/labos-inference.ts.\n${aiFromViolations.join("\n")}`,
  );
  assert.deepEqual(
    genaiViolations,
    [],
    `@google/genai is restricted to the Google GenAI client, live-coach/, and ai/kitchen/gemini-video-upload.ts.\n${genaiViolations.join("\n")}`,
  );
}

function main() {
  testAiPackageImportsScoped();
  console.log("[ai-sdk-import-policy] all checks passed");
}

main();
