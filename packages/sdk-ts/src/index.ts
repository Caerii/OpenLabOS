/**
 * @openlabos/sdk-ts — typed client for `services/api`.
 *
 * This module is a thin, hand-rolled facade today; once the API publishes a
 * stable OpenAPI document, the bulk of this file will be regenerated under
 * `_generated/`. The hand-rolled surface stays small on purpose so the
 * regeneration story is just "delete and re-emit."
 */
import {
  type Judgment,
  type Protocol,
  type RunManifest,
  type Session,
  type SessionEvent,
  parseJudgmentJson,
  parseProtocolJson,
  parseRunManifestJson,
} from "@openlabos/protocol";

export interface ClientOptions {
  /** Base URL of services/api, e.g. "http://localhost:3847". */
  baseUrl: string;
  /** Optional fetch implementation, defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Optional headers applied to every request. */
  headers?: Record<string, string>;
}

export class OpenLabOSClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    parser?: (body: string) => T,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: { ...(this.opts.headers ?? {}), ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenLabOS ${path} failed: ${res.status} ${text}`);
    }
    return parser ? parser(text) : (JSON.parse(text) as T);
  }

  // ── Protocols ─────────────────────────────────────────────
  listProtocols(): Promise<{ protocols: Protocol[] }> {
    return this.request<{ protocols: Protocol[] }>("/api/protocols");
  }
  getProtocol(id: string): Promise<Protocol> {
    return this.request<Protocol>(`/api/protocols/${encodeURIComponent(id)}`, {}, parseProtocolJson);
  }

  // ── Sessions ──────────────────────────────────────────────
  startSession(input: {
    protocol_id: string;
    protocol_version: string;
    device_adapter_id: string;
    operator_id?: string;
    tags?: string[];
  }): Promise<Session> {
    return this.request<Session>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }
  appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    return this.request<void>(`/api/sessions/${sessionId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  }
  finalizeSession(sessionId: string): Promise<RunManifest> {
    return this.request<RunManifest>(
      `/api/sessions/${sessionId}/finalize`,
      { method: "POST" },
      parseRunManifestJson,
    );
  }

  // ── Judgments ─────────────────────────────────────────────
  submitJudgment(input: Judgment): Promise<{ accepted: true }> {
    return this.request<{ accepted: true }>("/api/judgments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }
  getJudgment(judgmentId: string): Promise<Judgment> {
    return this.request<Judgment>(
      `/api/judgments/${judgmentId}`,
      {},
      parseJudgmentJson,
    );
  }
}

export type {
  Judgment,
  Protocol,
  RunManifest,
  Session,
  SessionEvent,
} from "@openlabos/protocol";
