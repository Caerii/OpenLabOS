/**
 * Event-sourced session store.
 *
 * The legacy stack mutated session state imperatively across many handlers,
 * which made debugging "what did the system think happened" expensive. This
 * store inverts the pattern: every state change is an append-only
 * `SessionEvent`. Current state is a fold over the event log; replay is
 * automatic; manifests are the closure of (events + protocol hash).
 *
 * The in-memory implementation is the test target. A SQLite-backed
 * implementation (Tier 1) and a Postgres-backed implementation (Tier 2)
 * share this interface — see decision 0008.
 */
import { randomUUID } from "node:crypto";
import {
  type Session,
  type SessionEvent,
  type SessionStatus,
  SessionEventSchema,
  SessionSchema,
} from "@openlabos/protocol";

export interface SessionView {
  session: Session;
  /** Last completed step_id, or undefined if no step has completed yet. */
  lastCompletedStepId?: string;
  /** Currently active step_id, or undefined if none is active. */
  activeStepId?: string;
  /** Counts derived from the fold. */
  counts: {
    framesCaptured: number;
    judgmentsEmitted: number;
    stepsCompleted: number;
    operatorNotes: number;
  };
}

export interface SessionStore {
  startSession(input: {
    protocolId: string;
    protocolVersion: string;
    deviceAdapterId: string;
    operatorId?: string;
    tags?: string[];
  }): Promise<Session>;
  appendEvent(sessionId: string, event: SessionEvent): Promise<void>;
  getSession(sessionId: string): Promise<Session | undefined>;
  getEvents(sessionId: string): Promise<SessionEvent[]>;
  getView(sessionId: string): Promise<SessionView | undefined>;
  finalize(sessionId: string, status: SessionStatus): Promise<Session>;
  list(): Promise<Session[]>;
}

export function fold(session: Session, events: SessionEvent[]): SessionView {
  let lastCompletedStepId: string | undefined;
  let activeStepId: string | undefined;
  const counts = {
    framesCaptured: 0,
    judgmentsEmitted: 0,
    stepsCompleted: 0,
    operatorNotes: 0,
  };
  for (const e of events) {
    switch (e.kind) {
      case "step_started":
        activeStepId = e.step_id;
        break;
      case "step_completed":
        if (e.succeeded) {
          lastCompletedStepId = e.step_id;
          counts.stepsCompleted += 1;
        }
        if (activeStepId === e.step_id) activeStepId = undefined;
        break;
      case "frame_captured":
        counts.framesCaptured += 1;
        break;
      case "judgment_emitted":
        counts.judgmentsEmitted += 1;
        break;
      case "operator_note":
        counts.operatorNotes += 1;
        break;
      default:
        // session_finalized — view-level state captured via Session.status
        break;
    }
  }
  return { session, lastCompletedStepId, activeStepId, counts };
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly events = new Map<string, SessionEvent[]>();

  async startSession(input: {
    protocolId: string;
    protocolVersion: string;
    deviceAdapterId: string;
    operatorId?: string;
    tags?: string[];
  }): Promise<Session> {
    const session = SessionSchema.parse({
      session_id: randomUUID(),
      protocol_id: input.protocolId,
      protocol_version: input.protocolVersion,
      device_adapter_id: input.deviceAdapterId,
      operator_id: input.operatorId,
      started_at: new Date().toISOString(),
      status: "active" satisfies SessionStatus,
      tags: input.tags ?? [],
    } satisfies Session);
    this.sessions.set(session.session_id, session);
    this.events.set(session.session_id, []);
    return session;
  }

  async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const parsed = SessionEventSchema.parse(event);
    this.events.get(sessionId)!.push(parsed);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async getEvents(sessionId: string): Promise<SessionEvent[]> {
    return [...(this.events.get(sessionId) ?? [])];
  }

  async getView(sessionId: string): Promise<SessionView | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return fold(session, this.events.get(sessionId) ?? []);
  }

  async finalize(sessionId: string, status: SessionStatus): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const finalized: Session = {
      ...session,
      status,
      ended_at: new Date().toISOString(),
    };
    this.sessions.set(sessionId, finalized);
    await this.appendEvent(sessionId, {
      kind: "session_finalized",
      at: finalized.ended_at!,
      status,
    });
    return finalized;
  }

  async list(): Promise<Session[]> {
    return [...this.sessions.values()];
  }
}
