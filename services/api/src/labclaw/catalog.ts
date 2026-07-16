/**
 * Build a searchable catalog of LabClaw SKILL.md entries under a repo root.
 */

import fs from "fs/promises";
import path from "path";

export interface LabclawSkillEntry {
  /** Repo-relative posix path, e.g. skills/bio/scanpy/SKILL.md */
  ref: string;
  /** Top-level domain folder under skills/: bio, vision, pharma, … */
  domain: string;
  /** Best-effort title from first markdown H1 in the file */
  title: string;
}

const MAX_FILES = 4000;
const MAX_DEPTH = 14;
const TITLE_SCAN_BYTES = 8000;

let cache: { t: number; root: string; entries: LabclawSkillEntry[]; truncated: boolean } | null = null;
const TTL_MS = 45_000;

function firstMarkdownTitle(md: string): string {
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim().slice(0, 200);
  }
  return "Skill";
}

export async function listLabclawSkills(
  repoRoot: string,
): Promise<{ entries: LabclawSkillEntry[]; truncated: boolean }> {
  const now = Date.now();
  if (cache && cache.root === repoRoot && now - cache.t < TTL_MS) {
    return { entries: cache.entries, truncated: cache.truncated };
  }

  const skillAbsPaths: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (skillAbsPaths.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skillAbsPaths.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.name === "SKILL.md") {
        skillAbsPaths.push(full);
      }
    }
  }

  await walk(repoRoot, 0);

  const rootNorm = repoRoot.replace(/\\/g, "/");
  const out: LabclawSkillEntry[] = [];

  for (const abs of skillAbsPaths) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    if (!rel.startsWith("skills/")) continue;
    const parts = rel.split("/");
    const domain = parts[1] || "unknown";
    let title = path.basename(path.dirname(rel));
    try {
      const fh = await fs.open(abs, "r");
      try {
        const buf = Buffer.allocUnsafe(Math.min(TITLE_SCAN_BYTES, 96 * 1024));
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        title = firstMarkdownTitle(buf.subarray(0, bytesRead).toString("utf8"));
      } finally {
        await fh.close();
      }
    } catch {
      /* keep dirname title */
    }
    out.push({ ref: rel, domain, title });
  }

  out.sort((a, b) => a.ref.localeCompare(b.ref));
  cache = { t: now, root: repoRoot, entries: out, truncated };
  return { entries: out, truncated };
}

export function invalidateLabclawCatalogCache() {
  cache = null;
}
