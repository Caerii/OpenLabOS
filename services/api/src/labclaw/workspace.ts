/**
 * Safe filesystem access for a local LabClaw clone (LABCLAW_SKILLS_ROOT).
 */

import path from "path";

const MAX_SKILL_READ_BYTES = 400_000;

export function labclawRootFromEnv(): string | null {
  const r = process.env.LABCLAW_SKILLS_ROOT?.trim();
  return r ? path.resolve(r) : null;
}

/**
 * Resolve `skillRef` (posix, relative to repo root, must be `skills/.../SKILL.md`) to an absolute path.
 * Rejects `..` and paths that escape the repo root.
 */
export function resolveSkillMarkdownPath(repoRoot: string, skillRef: string): string {
  const normalized = skillRef.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid skill path");
  }
  if (!normalized.startsWith("skills/")) {
    throw new Error("Skill path must start with skills/");
  }
  if (!normalized.endsWith("/SKILL.md")) {
    throw new Error("Only SKILL.md files are readable through this API");
  }
  const abs = path.resolve(repoRoot, ...normalized.split("/"));
  const rootAbs = path.resolve(repoRoot);
  const absN = abs.replace(/\\/g, "/").toLowerCase();
  const rootN = rootAbs.replace(/\\/g, "/").toLowerCase();
  if (absN !== rootN && !absN.startsWith(`${rootN}/`)) {
    throw new Error("Path escapes LABCLAW_SKILLS_ROOT");
  }
  return abs;
}

export function maxSkillReadBytes() {
  return MAX_SKILL_READ_BYTES;
}
