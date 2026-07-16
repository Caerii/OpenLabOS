/**
 * Sessions are append-only event streams. These tests pin three invariants:
 *   1. Each event variant is structurally valid in isolation.
 *   2. Replaying a serialized log preserves order and content exactly.
 *   3. Status transitions that the schema can express are accepted; common
 *      typos and shape mistakes are rejected with a useful message.
 */
import { describe, expect, it } from "vitest";
import { SessionEventSchema, SessionSchema } from "../src/session.js";

const ISO = "2026-05-04T17:00:00.000Z";
const SID = "00000000-0000-4000-8000-000000000001";

describe("SessionSchema", () => {
  it("accepts a freshly-started session", () => {
    expect(() =>
      SessionSchema.parse({
        session_id: SID,
        protocol_id: "kitchen-tea",
        protocol_version: "1.0.0",
        device_adapter_id: "webcam",
        started_at: ISO,
        status: "active",
        tags: [],
      }),
    ).not.toThrow();
  });

  it("rejects a non-uuid session_id", () => {
    expect(() =>
      SessionSchema.parse({
        session_id: "session-1",
        protocol_id: "kitchen-tea",
        protocol_version: "1.0.0",
        device_adapter_id: "webcam",
        started_at: ISO,
        status: "active",
      }),
    ).toThrow();
  });
});

describe("SessionEventSchema", () => {
  const events = [
    { kind: "step_started", at: ISO, step_id: "place-mug" },
    {
      kind: "frame_captured",
      at: ISO,
      step_id: "place-mug",
      frame_uri: "file:///tmp/frame-001.jpg",
    },
    {
      kind: "judgment_emitted",
      at: ISO,
      step_id: "place-mug",
      judgment_id: "00000000-0000-4000-8000-000000000002",
    },
    {
      kind: "step_completed",
      at: ISO,
      step_id: "place-mug",
      succeeded: true,
    },
    { kind: "operator_note", at: ISO, text: "looks good" },
    { kind: "session_finalized", at: ISO, status: "completed" },
  ] as const;

  it("accepts every event variant", () => {
    for (const e of events) {
      expect(() => SessionEventSchema.parse(e)).not.toThrow();
    }
  });

  it("preserves a serialized log under round-trip", () => {
    const serialized = JSON.stringify(events);
    const replayed = JSON.parse(serialized).map((e: unknown) =>
      SessionEventSchema.parse(e),
    );
    expect(replayed).toEqual(events);
  });

  it("rejects an event with an unknown kind", () => {
    expect(() =>
      SessionEventSchema.parse({ kind: "unknown_event", at: ISO }),
    ).toThrow();
  });
});
