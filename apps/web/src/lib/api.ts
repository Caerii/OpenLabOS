/**
 * Browser-side API client over services/api.
 *
 * In dev the Vite proxy forwards /api → http://localhost:3847, so the
 * effective base is empty. In production we read OPENLABOS_API_URL from
 * import.meta.env.VITE_API_URL (set by the deploy environment).
 */
import type {
  Judgment,
  Protocol,
  Session,
  SessionEvent,
} from "@openlabos/protocol";

export interface ApiHealth {
  ok: boolean;
  service: "@openlabos/api";
  uptime_seconds: number;
  adapters: number;
  modules: number;
}

export interface AdapterRecord {
  id: string;
  capabilities: string[];
  registeredAt: string;
}

export interface ModuleRecord {
  id: string;
  version: string;
  description: string;
  criterion_kinds: string[];
}

export interface SessionView {
  session: Session;
  lastCompletedStepId?: string;
  activeStepId?: string;
  counts: {
    framesCaptured: number;
    judgmentsEmitted: number;
    stepsCompleted: number;
    operatorNotes: number;
  };
}

const baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export const api = {
  health: () => req<ApiHealth>("/api/healthz"),
  adapters: () => req<{ adapters: AdapterRecord[] }>("/api/adapters"),
  modules: () => req<{ modules: ModuleRecord[] }>("/api/modules"),
  listSessions: () => req<{ sessions: Session[] }>("/api/sessions"),
  startSession: (input: {
    protocol_id: string;
    protocol_version: string;
    device_adapter_id: string;
    operator_id?: string;
    tags?: string[];
  }) =>
    req<Session>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  appendEvent: (sessionId: string, event: SessionEvent) =>
    req<{ accepted: true }>(`/api/sessions/${sessionId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    }),
  finalize: (sessionId: string, status: "completed" | "abandoned" | "errored") =>
    req<Session>(`/api/sessions/${sessionId}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  view: (sessionId: string) =>
    req<SessionView>(`/api/sessions/${sessionId}`),
  judge: (input: {
    session_id: string;
    step: {
      step_id: string;
      title: string;
      instruction: string;
      expected_objects?: Array<{ object_id: string; label: string }>;
      success_criteria?: Array<{ kind: string; description?: string }>;
    };
    frame_uri?: string;
    frame_b64?: string;
    provider?: string;
  }) =>
    req<Judgment>("/api/judgments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export type { Judgment, Protocol, Session, SessionEvent };
