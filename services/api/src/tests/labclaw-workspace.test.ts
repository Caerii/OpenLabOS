/**
 * LabClaw path safety (no device, no keys).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSkillMarkdownPath } from "../labclaw/workspace.js";

function testAllowsValidSkill() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "labclaw-ws-"));
  const skillDir = path.join(tmp, "skills", "bio", "demo");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Demo\n", "utf8");

  const abs = resolveSkillMarkdownPath(tmp, "skills/bio/demo/SKILL.md");
  assert.ok(fs.existsSync(abs));
}

function testRejectsTraversal() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "labclaw-ws-"));
  assert.throws(() => resolveSkillMarkdownPath(tmp, "skills/../secret/SKILL.md"));
}

function testRejectsNonSkills() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "labclaw-ws-"));
  assert.throws(() => resolveSkillMarkdownPath(tmp, "README.md"));
}

function main() {
  testAllowsValidSkill();
  testRejectsTraversal();
  testRejectsNonSkills();
  console.log("[labclaw-workspace] all checks passed");
}

main();
