/**
 * Run a provider-agnostic chat turn with optional full SKILL.md injected as system context.
 * This is how LabOS "runs" LabClaw skills without OpenClaw: the skill document grounds the model;
 * heavy tools (Python, ToolUniverse, etc.) still belong to OpenClaw or a future executor service.
 */

import fs from "fs/promises";
import { labosGenerateText } from "../ai/labos-inference.js";
import { maxSkillReadBytes, resolveSkillMarkdownPath } from "./workspace.js";

const DEFAULT_MODEL = process.env.LABCLAW_CHAT_MODEL?.trim() || "google:gemini-2.5-flash";

const SYSTEM_PREAMBLE = `You are LabOS LabClaw Runner. You must follow the attached LabClaw SKILL.md as authoritative guidance for tools, safety, and output shape.
You are executing inside the Mentra LabOS dashboard (not OpenClaw). You cannot run shell commands or Python yourself—produce concrete, copy-pasteable commands and cite limitations where wet-lab or HPC execution is required.
Be accurate; say when something requires external execution.`;

export type LabclawChatMessage = { role: "user" | "assistant"; content: string };

export async function runLabclawSkillChat(opts: {
  repoRoot: string;
  skillRef: string | undefined;
  messages: LabclawChatMessage[];
  modelId?: string;
}): Promise<{ text: string; modelId: string; latencyMs: number; skillRef?: string }> {
  const modelId = opts.modelId?.trim() || DEFAULT_MODEL;
  const t0 = Date.now();

  let skillBlock = "";
  if (opts.skillRef) {
    const abs = resolveSkillMarkdownPath(opts.repoRoot, opts.skillRef);
    const raw = await fs.readFile(abs, { encoding: "utf8" });
    const cap = maxSkillReadBytes();
    const body = raw.length > cap ? `${raw.slice(0, cap)}\n\n[truncated at ${cap} bytes]` : raw;
    skillBlock = `\n\n--- LABCLAW SKILL (${opts.skillRef}) ---\n\n${body}`;
  }

  const system = `${SYSTEM_PREAMBLE}${skillBlock}`;

  const conv = [
    { role: "system" as const, content: system },
    ...opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const result = await labosGenerateText({
    modelId,
    messages: conv,
    temperature: 0.35,
  });

  return {
    text: result.text,
    modelId,
    latencyMs: Date.now() - t0,
    skillRef: opts.skillRef,
  };
}
