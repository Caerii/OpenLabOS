import { request } from "./core";

export interface ApiReadyzResult {
  ready: boolean;
  checks: {
    inference: { ok: boolean; detail?: string };
    perception: { ok: boolean; detail?: string };
  };
}

export interface RunTimelineEntry {
  at: string;
  kind: string;
  summary: string;
}

export const apiReadyz = () => request<ApiReadyzResult>("/api/readyz");

export const apiRunTimeline = (sessionId: string) =>
  request<{ session_id: string; timeline: RunTimelineEntry[] }>(`/api/runs/${encodeURIComponent(sessionId)}/timeline`);
