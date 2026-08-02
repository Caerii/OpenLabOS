import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FilesystemSessionStore } from "../../src/core/sessions/filesystem-store.js";

describe("FilesystemSessionStore", () => {
  it("persists sessions and events across store reopen", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openlabos-fs-"));
    process.env.OPENLABOS_DATA_DIR = tmp;

    const store1 = new FilesystemSessionStore();
    const session = await store1.startSession({
      protocolId: "kitchen-tea",
      protocolVersion: "1.0.0",
      deviceAdapterId: "webcam",
    });
    await store1.appendEvent(session.session_id, {
      kind: "operator_note",
      at: new Date().toISOString(),
      text: "persisted",
    });

    const store2 = new FilesystemSessionStore();
    const events = await store2.getEvents(session.session_id);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("operator_note");
  });
});
