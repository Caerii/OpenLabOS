import { postJson, request, withQuery } from "./core";

export type LabClawStatus =
  | {
      configured: false;
      hint: string;
      repoUrl: string;
      docsUrl: string;
      openclawInstallLine: string;
    }
  | {
      configured: true;
      ok: true;
      root: string;
      skillMdCount: number;
      labosSkillFolderCount: number;
      visionOrXrSkillCount: number;
      samples: string[];
      truncated: boolean;
      repoUrl: string;
      docsUrl: string;
      openclawInstallLine: string;
    }
  | { configured: true; ok: false; error: string; path?: string };

export interface LabosSkillFitClient {
  tier: 1 | 2 | 3;
  safetyScore: number;
  valueScore: number;
  reasons: string[];
  recommended: boolean;
}

export interface LabclawSkillRow {
  ref: string;
  domain: string;
  title: string;
  labosFit: LabosSkillFitClient;
}

export const labclawStatus = () => request<LabClawStatus>("/api/labclaw/status");

export const labclawSkills = (opts?: {
  q?: string;
  limit?: number;
  refresh?: boolean;
  sort?: "fit" | "path";
}) =>
  request<{
    root: string;
    total: number;
    returned: number;
    sort: "fit" | "path";
    skills: LabclawSkillRow[];
  }>(
    withQuery("/api/labclaw/skills", {
      q: opts?.q,
      limit: opts?.limit,
      refresh: opts?.refresh ? 1 : undefined,
      sort: opts?.sort === "fit" ? "fit" : undefined,
    }),
  );

export const labclawSkillContent = (ref: string) =>
  request<{ ref: string; truncated: boolean; content: string }>(
    withQuery("/api/labclaw/skill", { ref }),
  );

export const labclawChat = (body: {
  message: string;
  skillRef?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  modelId?: string;
}) =>
  postJson<{ text: string; modelId: string; latencyMs: number; skillRef?: string }>(
    "/api/labclaw/chat",
    body,
  );
