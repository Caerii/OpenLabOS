/**
 * LabClaw — local skill library integration for LabOS.
 * https://github.com/wu-yc/LabClaw
 *
 * - `LABCLAW_SKILLS_ROOT`: repo root (contains skills/.../SKILL.md files)
 * - Catalog + safe read + skill-grounded chat (Vercel AI SDK via `labos-inference`)
 * - Full OpenClaw tool execution remains external; see panel copy + decision log.
 */

import { Router, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import { labclawRootFromEnv, resolveSkillMarkdownPath, maxSkillReadBytes } from "../labclaw/workspace.js";
import { invalidateLabclawCatalogCache, listLabclawSkills } from "../labclaw/catalog.js";
import { compareLabclawSkillFit, scoreLabclawSkillForLabOS } from "../labclaw/labos-skill-fit.js";
import { runLabclawSkillChat, type LabclawChatMessage } from "../labclaw/skill-chat.js";

const router = Router();

router.get("/status", async (_req: Request, res: Response) => {
  const root = process.env.LABCLAW_SKILLS_ROOT?.trim();
  if (!root) {
    res.json({
      configured: false,
      hint: "Clone https://github.com/wu-yc/LabClaw and set LABCLAW_SKILLS_ROOT to the repository root.",
      repoUrl: "https://github.com/wu-yc/LabClaw",
      docsUrl: "https://labclaw-ai.github.io/",
      openclawInstallLine: "install https://github.com/wu-yc/LabClaw",
    });
    return;
  }

  let abs: string;
  try {
    abs = path.resolve(root);
    const st = await fs.stat(abs);
    if (!st.isDirectory()) {
      res.status(400).json({ configured: true, ok: false, error: "LABCLAW_SKILLS_ROOT is not a directory", path: abs });
      return;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Cannot read path";
    res.status(400).json({ configured: true, ok: false, error: message, path: root });
    return;
  }

  try {
    const { entries, truncated } = await listLabclawSkills(abs);
    const norm = (p: string) => p.replace(/\\/g, "/");
    const labosSkillFolderCount = entries.filter((e) => norm(e.ref).includes("/skills/labos/")).length;
    const visionOrXrSkillCount = entries.filter(
      (e) => norm(e.ref).includes("/skills/vision/") || norm(e.ref).includes("/skills/xr/"),
    ).length;
    const samples = entries.slice(0, 16).map((e) => e.ref);

    res.json({
      configured: true,
      ok: true,
      root: abs,
      skillMdCount: entries.length,
      labosSkillFolderCount,
      visionOrXrSkillCount,
      samples,
      truncated,
      repoUrl: "https://github.com/wu-yc/LabClaw",
      docsUrl: "https://labclaw-ai.github.io/",
      openclawInstallLine: "install https://github.com/wu-yc/LabClaw",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Catalog failed";
    res.status(500).json({ configured: true, ok: false, error: message, path: abs });
  }
});

/** Searchable skill list (cached ~45s server-side). `?refresh=1` busts cache. */
router.get("/skills", async (req: Request, res: Response) => {
  const root = labclawRootFromEnv();
  if (!root) {
    res.status(400).json({ error: "LABCLAW_SKILLS_ROOT is not set" });
    return;
  }
  if (req.query.refresh === "1") invalidateLabclawCatalogCache();

  try {
    const { entries: all } = await listLabclawSkills(root);
    const q = String(req.query.q || "")
      .toLowerCase()
      .trim();
    const filtered = q
      ? all.filter(
          (s) =>
            s.ref.toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q) ||
            s.domain.toLowerCase().includes(q),
        )
      : all;
    const limit = Math.min(600, Math.max(1, parseInt(String(req.query.limit || "250"), 10) || 250));
    const sortFit = String(req.query.sort || "") === "fit";

    const enriched = filtered.map((s) => ({
      ...s,
      labosFit: scoreLabclawSkillForLabOS(s),
    }));
    if (sortFit) enriched.sort(compareLabclawSkillFit);

    res.json({
      root,
      total: all.length,
      returned: Math.min(enriched.length, limit),
      sort: sortFit ? "fit" : "path",
      skills: enriched.slice(0, limit),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "List failed";
    res.status(500).json({ error: message });
  }
});

/** Read one SKILL.md (capped). Query: ?ref=skills/bio/scanpy/SKILL.md */
router.get("/skill", async (req: Request, res: Response) => {
  const root = labclawRootFromEnv();
  const ref = String(req.query.ref || "").trim();
  if (!root || !ref) {
    res.status(400).json({ error: "LABCLAW_SKILLS_ROOT or ref query required" });
    return;
  }
  try {
    const abs = resolveSkillMarkdownPath(root, ref);
    const raw = await fs.readFile(abs, "utf8");
    const cap = maxSkillReadBytes();
    const truncated = raw.length > cap;
    res.json({ ref, truncated, content: truncated ? raw.slice(0, cap) : raw });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Read failed";
    res.status(400).json({ error: message });
  }
});

/**
 * Skill-grounded chat (single turn + short history). Injects full SKILL when `skillRef` is set.
 * Body: { message, skillRef?, history?: [{ role: "user"|"assistant", content }], modelId? }
 */
router.post("/chat", async (req: Request, res: Response) => {
  const root = labclawRootFromEnv();
  if (!root) {
    res.status(400).json({ error: "LABCLAW_SKILLS_ROOT is not set" });
    return;
  }

  const { skillRef, message, history, modelId } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "body.message (string) is required" });
    return;
  }

  const histRaw = Array.isArray(history) ? history.slice(-24) : [];
  const hist: LabclawChatMessage[] = [];
  for (const m of histRaw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      hist.push({ role, content: content.slice(0, 24_000) });
    }
  }
  hist.push({ role: "user", content: message.slice(0, 24_000) });

  try {
    const out = await runLabclawSkillChat({
      repoRoot: root,
      skillRef: typeof skillRef === "string" && skillRef.trim() ? skillRef.trim() : undefined,
      messages: hist,
      modelId: typeof modelId === "string" ? modelId : undefined,
    });
    res.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Chat failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
