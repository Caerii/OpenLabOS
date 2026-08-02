import type { SessionEvent } from "@openlabos/protocol";
import type { SessionStore } from "../core/sessions/store.js";

/** Maps legacy kitchen run events to canonical Hono SessionEvents. */
export function kitchenEventToSessionEvent(input: {
  type: string;
  ts: number;
  runId?: string | null;
  protocolId?: string | null;
  payload?: Record<string, unknown>;
}): SessionEvent | null {
  const at = new Date(input.ts).toISOString();
  switch (input.type) {
    case "run_start":
    case "run_resume":
      return null;
    case "confirm_step":
    case "complete_step": {
      const stepId = String(input.payload?.stepId ?? input.payload?.step_id ?? "");
      if (!stepId) return null;
      return {
        kind: "step_completed",
        at,
        step_id: stepId,
        succeeded: true,
      };
    }
    case "skip_step": {
      const stepId = String(input.payload?.stepId ?? "");
      if (!stepId) return null;
      return { kind: "step_completed", at, step_id: stepId, succeeded: false };
    }
    case "rolling_evidence_marker":
      return {
        kind: "frame_captured",
        at,
        step_id: String(input.payload?.stepId ?? "unknown"),
        frame_uri: String(input.payload?.frameRef ?? input.payload?.frame_uri ?? ""),
      };
    case "vqa_annotation":
      return {
        kind: "operator_note",
        at,
        text: String(input.payload?.note ?? input.payload?.summary ?? "operator annotation"),
      };
    default:
      return null;
  }
}

export async function bridgeKitchenEvent(
  store: SessionStore,
  sessionId: string,
  kitchenEvent: Parameters<typeof kitchenEventToSessionEvent>[0],
): Promise<void> {
  const mapped = kitchenEventToSessionEvent(kitchenEvent);
  if (!mapped) return;
  try {
    await store.appendEvent(sessionId, mapped);
  } catch {
    // Kitchen may emit before Hono session exists; ignore.
  }
}
