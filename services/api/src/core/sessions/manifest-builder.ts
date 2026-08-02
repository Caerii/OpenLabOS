import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Judgment, RunManifest, Session, SessionEvent } from "@openlabos/protocol";
import { RunManifestSchema } from "@openlabos/protocol";
import { sessionManifestPath } from "../../storage/repository.js";
import type { SessionStore } from "../sessions/store.js";

export function protocolHash(protocolJson: string): string {
  return `sha256:${createHash("sha256").update(protocolJson).digest("hex")}`;
}

export async function buildRunManifest(input: {
  session: Session;
  events: SessionEvent[];
  judgments: Judgment[];
  protocolJson: string;
  artifacts?: Record<string, string>;
}): Promise<RunManifest> {
  return RunManifestSchema.parse({
    manifest_version: 1,
    session: input.session,
    protocol_hash: protocolHash(input.protocolJson),
    events: input.events,
    judgments: input.judgments,
    artifacts: input.artifacts ?? {},
  });
}

export async function writeRunManifest(
  store: SessionStore,
  sessionId: string,
  judgments: Judgment[],
  protocolJson: string,
  artifacts?: Record<string, string>,
): Promise<RunManifest> {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  const events = await store.getEvents(sessionId);
  const manifest = await buildRunManifest({
    session,
    events,
    judgments,
    protocolJson,
    artifacts,
  });
  fs.mkdirSync(sessionManifestPath(sessionId).replace(/[/\\]manifest\.json$/, ""), {
    recursive: true,
  });
  fs.writeFileSync(sessionManifestPath(sessionId), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
