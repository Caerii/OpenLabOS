import { describe, expect, it } from "vitest";
import { InMemorySessionStore, fold } from "../../src/core/sessions/store.js";

describe("replay recovery", () => {
  it("rebuilds view from persisted events after simulated restart", async () => {
    const store = new InMemorySessionStore();
    const session = await store.startSession({
      protocolId: "kitchen-tea",
      protocolVersion: "1.0.0",
      deviceAdapterId: "mock",
    });
    const at = new Date().toISOString();
    await store.appendEvent(session.session_id, { kind: "step_started", at, step_id: "place-mug" });
    await store.appendEvent(session.session_id, {
      kind: "step_completed",
      at,
      step_id: "place-mug",
      succeeded: true,
    });
    const events = await store.getEvents(session.session_id);
    const replayed = fold(session, events);
    const live = await store.getView(session.session_id);
    expect(replayed).toEqual(live);
  });
});
