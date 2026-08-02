import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { AppDeps } from "../app.js";
import { FilesystemSessionStore } from "../../core/sessions/filesystem-store.js";
import {
  runsIndexPath,
  sessionManifestPath,
  sessionRootPath,
  sessionsDir,
} from "../../storage/repository.js";
import { writeRunManifest } from "../../core/sessions/manifest-builder.js";

const ListQuery = z.object({
  protocol_id: z.string().optional(),
  status: z.enum(["active", "completed", "abandoned", "errored"]).optional(),
  q: z.string().optional(),
});

function loadProtocolJson(protocolId: string, version: string): string {
  const candidate = path.resolve(
    process.cwd(),
    "../../examples/protocols",
    `${protocolId}.protocol.json`,
  );
  const local = path.join(sessionsDir(), "..", "..", "examples", "protocols", `${protocolId}.protocol.json`);
  const paths = [
    candidate,
    local,
    path.resolve(process.cwd(), "examples/protocols", `${protocolId}.protocol.json`),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return JSON.stringify({ protocol_id: protocolId, protocol_version: version });
}

function refreshIndex(sessions: AppDeps["sessions"]) {
  return sessions.list().then((all) => {
    const entries = all.map((s) => ({
      session_id: s.session_id,
      protocol_id: s.protocol_id,
      protocol_version: s.protocol_version,
      status: s.status,
      started_at: s.started_at,
      ended_at: s.ended_at,
    }));
    fs.mkdirSync(sessionsDir(), { recursive: true });
    fs.writeFileSync(runsIndexPath(), `${JSON.stringify({ runs: entries }, null, 2)}\n`);
    return entries;
  });
}

export function runsRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/", async (c) => {
    const query = ListQuery.parse({
      protocol_id: c.req.query("protocol_id"),
      status: c.req.query("status"),
      q: c.req.query("q"),
    });
    let entries = await refreshIndex(deps.sessions);
    if (query.protocol_id) entries = entries.filter((e) => e.protocol_id === query.protocol_id);
    if (query.status) entries = entries.filter((e) => e.status === query.status);
    if (query.q) {
      const needle = query.q.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.session_id.toLowerCase().includes(needle)
          || e.protocol_id.toLowerCase().includes(needle),
      );
    }
    return c.json({ runs: entries });
  });

  app.get("/:session_id/timeline", async (c) => {
    const sessionId = c.req.param("session_id");
    const events = await deps.sessions.getEvents(sessionId);
    if (!events.length && !(await deps.sessions.getSession(sessionId))) {
      return c.json({ error: "Unknown session" }, 404);
    }
    return c.json({
      session_id: sessionId,
      timeline: events.map((e) => ({
        at: e.at,
        kind: e.kind,
        summary:
          e.kind === "operator_note"
            ? e.text
            : e.kind === "step_completed"
              ? `${e.step_id}:${e.succeeded ? "ok" : "fail"}`
              : e.kind,
      })),
    });
  });

  app.get("/:session_id/metrics", async (c) => {
    const sessionId = c.req.param("session_id");
    const view = await deps.sessions.getView(sessionId);
    if (!view) return c.json({ error: "Unknown session" }, 404);
    const session = view.session;
    const durationMs =
      session.ended_at && session.started_at
        ? Date.parse(session.ended_at) - Date.parse(session.started_at)
        : null;
    return c.json({
      session_id: sessionId,
      duration_ms: durationMs,
      steps_completed: view.counts.stepsCompleted,
      frames_captured: view.counts.framesCaptured,
      judgments_emitted: view.counts.judgmentsEmitted,
      operator_notes: view.counts.operatorNotes,
      measurements_recorded: view.counts.measurementsRecorded,
      status: session.status,
    });
  });

  app.post("/:session_id/export", async (c) => {
    const sessionId = c.req.param("session_id");
    const session = await deps.sessions.getSession(sessionId);
    if (!session) return c.json({ error: "Unknown session" }, 404);
    const protocolJson = loadProtocolJson(session.protocol_id, session.protocol_version);
    await writeRunManifest(deps.sessions, sessionId, [], protocolJson);
    const root = sessionRootPath(sessionId);
    const outDir = path.join(root, "export");
    fs.mkdirSync(outDir, { recursive: true });
    const bundlePath = path.join(outDir, `${sessionId}.json.gz`);
    const raw = fs.readFileSync(sessionManifestPath(sessionId));
    const gz = gzipSync(raw);
    fs.writeFileSync(bundlePath, gz);
    return c.json({
      session_id: sessionId,
      bundle_path: bundlePath,
      manifest_path: sessionManifestPath(sessionId),
      byte_length: raw.byteLength,
    });
  });

  app.delete("/:session_id", async (c) => {
    const sessionId = c.req.param("session_id");
    const root = sessionRootPath(sessionId);
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    return c.json({ deleted: true, session_id: sessionId });
  });

  app.post("/import", async (c) => {
    const body = await c.req.json<{ manifest?: unknown }>().catch(() => ({}) as { manifest?: unknown });
    if (!body.manifest) return c.json({ error: "manifest required" }, 400);
    const manifest = body.manifest as {
      session: { session_id: string; protocol_id: string; protocol_version: string; device_adapter_id: string };
      events: Array<{ kind: string; at: string }>;
    };
    const session = await deps.sessions.startSession({
      protocolId: manifest.session.protocol_id,
      protocolVersion: manifest.session.protocol_version,
      deviceAdapterId: manifest.session.device_adapter_id,
    });
    for (const event of manifest.events ?? []) {
      await deps.sessions.appendEvent(session.session_id, event as never);
    }
    return c.json({ imported: true, session_id: session.session_id }, 201);
  });

  app.get("/latest/active", async (c) => {
    const store = deps.sessions;
    if (store instanceof FilesystemSessionStore) {
      const latest = await store.getLatestActive();
      if (!latest) return c.json({ session: null });
      return c.json({ session: latest });
    }
    const all = await store.list();
    const active = all.find((s) => s.status === "active");
    return c.json({ session: active ?? null });
  });

  return app;
}
