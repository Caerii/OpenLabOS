/**
 * Event-sourced session store tests. These pin three properties:
 *
 *   1. State is a fold over events. Replaying a serialized log produces the
 *      same view as the live store.
 *   2. Append-only — old events stay verbatim across mutations; new events
 *      are accepted in any order the schema allows.
 *   3. Finalize emits its own session_finalized event so a reader who only
 *      sees the log can reconstruct end-of-life state.
 */
import { describe, expect, it } from "vitest";
import { InMemorySessionStore, fold } from "../../src/core/sessions/store.js";

const ISO = "2026-05-04T12:00:00.000Z";

async function freshSession() {
  const store = new InMemorySessionStore();
  const session = await store.startSession({
    protocolId: "kitchen-tea",
    protocolVersion: "1.0.0",
    deviceAdapterId: "webcam",
  });
  return { store, session };
}

describe("InMemorySessionStore", () => {
  it("creates active sessions with semver versions", async () => {
    const { session } = await freshSession();
    expect(session.status).toBe("active");
    expect(session.protocol_version).toBe("1.0.0");
    expect(session.tags).toEqual([]);
  });

  it("rejects events for unknown sessions", async () => {
    const { store } = await freshSession();
    await expect(
      store.appendEvent("00000000-0000-4000-8000-000000000000", {
        kind: "step_started",
        at: ISO,
        step_id: "x",
      }),
    ).rejects.toThrow(/Unknown session/);
  });

  it("folds events into a derived view", async () => {
    const { store, session } = await freshSession();
    const sid = session.session_id;
    await store.appendEvent(sid, { kind: "step_started", at: ISO, step_id: "place-mug" });
    await store.appendEvent(sid, {
      kind: "frame_captured",
      at: ISO,
      step_id: "place-mug",
      frame_uri: "file:///tmp/f1.jpg",
    });
    await store.appendEvent(sid, {
      kind: "frame_captured",
      at: ISO,
      step_id: "place-mug",
      frame_uri: "file:///tmp/f2.jpg",
    });
    await store.appendEvent(sid, {
      kind: "step_completed",
      at: ISO,
      step_id: "place-mug",
      succeeded: true,
    });
    const view = await store.getView(sid);
    expect(view!.activeStepId).toBeUndefined();
    expect(view!.lastCompletedStepId).toBe("place-mug");
    expect(view!.counts.framesCaptured).toBe(2);
    expect(view!.counts.stepsCompleted).toBe(1);
  });

  it("replay-from-log produces the same view as the live store", async () => {
    const { store, session } = await freshSession();
    const sid = session.session_id;
    await store.appendEvent(sid, { kind: "step_started", at: ISO, step_id: "s" });
    await store.appendEvent(sid, {
      kind: "operator_note",
      at: ISO,
      text: "looks ok",
    });
    const live = await store.getView(sid);
    const replay = fold(session, await store.getEvents(sid));
    expect(replay).toEqual(live);
  });

  it("finalize emits a session_finalized event reflecting the new status", async () => {
    const { store, session } = await freshSession();
    const final = await store.finalize(session.session_id, "completed");
    expect(final.status).toBe("completed");
    expect(final.ended_at).toBeDefined();
    const events = await store.getEvents(session.session_id);
    const last = events.at(-1)!;
    expect(last.kind).toBe("session_finalized");
    if (last.kind === "session_finalized") {
      expect(last.status).toBe("completed");
    }
  });
});
