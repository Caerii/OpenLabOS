/**
 * Tier-1 filesystem session persistence per ADR 0014. Sessions live under
 * data/sessions/<id>/session.json with append-only events.jsonl mirrors.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  type Session,
  type SessionEvent,
  type SessionStatus,
  SessionEventSchema,
  SessionSchema,
} from "@openlabos/protocol";
import { openLabosDataDir } from "../../data-root.js";
import {
  runsIndexPath,
  sessionEventsPath,
  sessionRootPath,
} from "../../storage/repository.js";
import { type SessionStore, type SessionView, fold } from "./store.js";

function sessionFilePath(sessionId: string): string {
  return path.join(sessionRootPath(sessionId), "session.json");
}

function readSessionFile(sessionId: string): Session | undefined {
  const file = sessionFilePath(sessionId);
  if (!fs.existsSync(file)) return undefined;
  return SessionSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

function writeSessionFile(session: Session): void {
  fs.mkdirSync(sessionRootPath(session.session_id), { recursive: true });
  fs.writeFileSync(sessionFilePath(session.session_id), `${JSON.stringify(session, null, 2)}\n`);
}

function readEventsFile(sessionId: string): SessionEvent[] {
  const file = sessionEventsPath(sessionId);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => SessionEventSchema.parse(JSON.parse(line)));
}

function appendEventFile(sessionId: string, event: SessionEvent): void {
  fs.mkdirSync(sessionRootPath(sessionId), { recursive: true });
  fs.appendFileSync(sessionEventsPath(sessionId), `${JSON.stringify(event)}\n`, "utf8");
}

function refreshIndex(sessions: Session[]): void {
  fs.mkdirSync(path.dirname(runsIndexPath()), { recursive: true });
  fs.writeFileSync(
    runsIndexPath(),
    `${JSON.stringify({ runs: sessions }, null, 2)}\n`,
    "utf8",
  );
}

const idempotency = new Map<string, string>();

export class FilesystemSessionStore implements SessionStore {
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
    writeSessionFile(session);
    await this.list().then(refreshIndex);
    return session;
  }

  async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    if (!readSessionFile(sessionId)) throw new Error(`Unknown session: ${sessionId}`);
    const parsed = SessionEventSchema.parse(event);
    appendEventFile(sessionId, parsed);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return readSessionFile(sessionId);
  }

  async getEvents(sessionId: string): Promise<SessionEvent[]> {
    return readEventsFile(sessionId);
  }

  async getView(sessionId: string): Promise<SessionView | undefined> {
    const session = await this.getSession(sessionId);
    if (!session) return undefined;
    return fold(session, await this.getEvents(sessionId));
  }

  async finalize(sessionId: string, status: SessionStatus): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const endedAt = new Date().toISOString();
    const finalized: Session = { ...session, status, ended_at: endedAt };
    writeSessionFile(finalized);
    await this.appendEvent(sessionId, {
      kind: "session_finalized",
      at: endedAt,
      status,
    });
    await this.list().then(refreshIndex);
    return finalized;
  }

  async list(): Promise<Session[]> {
    const root = path.join(openLabosDataDir(), "sessions");
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => readSessionFile(d.name))
      .filter((s): s is Session => Boolean(s))
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  }

  async getLatestActive(): Promise<Session | undefined> {
    const all = await this.list();
    return all.find((s) => s.status === "active");
  }

  checkEventIdempotency(
    key: string | undefined,
    sessionId: string,
    event: SessionEvent,
  ): { replay: boolean } | { conflict: true } {
    if (!key?.trim()) return { replay: false };
    const hash = JSON.stringify(event);
    const existing = idempotency.get(key.trim());
    if (existing) {
      if (existing !== hash) return { conflict: true };
      return { replay: true };
    }
    idempotency.set(key.trim(), hash);
    return { replay: false };
  }

  close(): void {
    // no-op for filesystem store
  }
}

/** @deprecated alias */
export class SqliteSessionStore extends FilesystemSessionStore {}
