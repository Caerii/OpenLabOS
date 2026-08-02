import type { SessionStore } from "../core/sessions/store.js";
import { bridgeKitchenEvent } from "./kitchen-to-session.js";
import type { KitchenRunEvent } from "../ai/kitchen/run-store.js";

const runToSession = new Map<string, string>();

let sessionStore: SessionStore | null = null;

export function initKitchenSessionBridge(store: SessionStore): void {
  sessionStore = store;
}

export function linkKitchenRunToSession(runId: string, sessionId: string): void {
  runToSession.set(runId, sessionId);
}

export function getLinkedSessionId(runId: string | null | undefined): string | undefined {
  if (!runId) return undefined;
  return runToSession.get(runId);
}

export async function onKitchenRunStarted(input: {
  runId: string;
  protocolId: string;
  protocolVersion: string;
}): Promise<string | undefined> {
  if (!sessionStore) return undefined;
  const session = await sessionStore.startSession({
    protocolId: input.protocolId,
    protocolVersion: input.protocolVersion || "1.0.0",
    deviceAdapterId: "kitchen-guided",
    tags: ["kitchen-bridge"],
  });
  linkKitchenRunToSession(input.runId, session.session_id);
  return session.session_id;
}

export async function bridgeKitchenRunEvent(evt: KitchenRunEvent): Promise<void> {
  if (!sessionStore) return;
  let sessionId = getLinkedSessionId(evt.runId);
  if (!sessionId && evt.runId && (evt.type === "run_start" || evt.type === "run_force_start")) {
    sessionId = await onKitchenRunStarted({
      runId: evt.runId,
      protocolId: String(evt.protocolId ?? "kitchen-tea"),
      protocolVersion: "1.0.0",
    });
  }
  if (!sessionId) return;
  await bridgeKitchenEvent(sessionStore, sessionId, {
    type: evt.type,
    ts: evt.ts,
    runId: evt.runId,
    protocolId: evt.protocolId,
    payload: evt.payload,
  });
}
