/**
 * Emit an OpenAPI 3.1 document for the Hono coordination API.
 *
 * Strategy: read JSON Schemas from packages/protocol/schema/ for the data
 * shapes, hand-list the route manifest here. This keeps the runtime
 * dependency on Hono pure (no schema-introspection plugin) and lets us
 * publish a stable contract independent of which web framework is in use.
 *
 * Run: `pnpm --filter @openlabos/api openapi:emit`
 * Out: `packages/sdk-ts/openapi.json`
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const schemaDir = resolve(repoRoot, "packages/protocol/schema");
const outPath = resolve(repoRoot, "packages/sdk-ts/openapi.json");

function readSchema(name: string): Record<string, unknown> {
  const txt = readFileSync(resolve(schemaDir, `${name}.schema.json`), "utf8");
  const json = JSON.parse(txt) as { $defs?: Record<string, unknown>; [k: string]: unknown };
  return json;
}

function refOrInline(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

const protocol = readSchema("protocol");
const session = readSchema("session");
const sessionEvent = readSchema("session-event");
const judgment = readSchema("judgment");
const runManifest = readSchema("run-manifest");

const components = {
  schemas: {
    Protocol: protocol,
    Session: session,
    SessionEvent: sessionEvent,
    Judgment: judgment,
    RunManifest: runManifest,
    Health: {
      type: "object",
      required: ["ok", "service"],
      properties: {
        ok: { type: "boolean" },
        service: { type: "string", const: "@openlabos/api" },
        uptime_seconds: { type: "number", minimum: 0 },
        adapters: { type: "integer", minimum: 0 },
        modules: { type: "integer", minimum: 0 },
      },
    },
    SessionStart: {
      type: "object",
      required: ["protocol_id", "protocol_version", "device_adapter_id"],
      properties: {
        protocol_id: { type: "string", minLength: 1 },
        protocol_version: { type: "string", minLength: 1 },
        device_adapter_id: { type: "string", minLength: 1 },
        operator_id: { type: "string" },
        tags: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    Finalize: {
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["completed", "abandoned", "errored"] },
      },
    },
    SessionView: {
      type: "object",
      required: ["session", "counts"],
      properties: {
        session: refOrInline("Session"),
        lastCompletedStepId: { type: "string" },
        activeStepId: { type: "string" },
        counts: {
          type: "object",
          properties: {
            framesCaptured: { type: "integer", minimum: 0 },
            judgmentsEmitted: { type: "integer", minimum: 0 },
            stepsCompleted: { type: "integer", minimum: 0 },
            operatorNotes: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    AdaptersList: {
      type: "object",
      properties: {
        adapters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              capabilities: { type: "array", items: { type: "string" } },
              registeredAt: { type: "string" },
            },
          },
        },
      },
    },
    ModulesList: {
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              version: { type: "string" },
              description: { type: "string" },
              criterion_kinds: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    Error: {
      type: "object",
      required: ["error"],
      properties: { error: { type: "string" } },
    },
  },
};

const ok = (schemaName: string) => ({
  description: "OK",
  content: { "application/json": { schema: refOrInline(schemaName) } },
});
const err = (status: number, description: string) => ({
  [status]: {
    description,
    content: { "application/json": { schema: refOrInline("Error") } },
  },
});

const paths = {
  "/api/healthz": {
    get: {
      summary: "Liveness + dependency snapshot",
      responses: { 200: ok("Health") },
    },
  },
  "/api/readyz": {
    get: { summary: "Readiness probe", responses: { 200: { description: "OK" } } },
  },
  "/api/sessions": {
    get: {
      summary: "List sessions",
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sessions: { type: "array", items: refOrInline("Session") },
                },
              },
            },
          },
        },
      },
    },
    post: {
      summary: "Start a new session",
      requestBody: {
        required: true,
        content: { "application/json": { schema: refOrInline("SessionStart") } },
      },
      responses: { 201: ok("Session") },
    },
  },
  "/api/sessions/{session_id}": {
    get: {
      summary: "Folded session view",
      parameters: [
        {
          name: "session_id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: { 200: ok("SessionView"), ...err(404, "Unknown session") },
    },
  },
  "/api/sessions/{session_id}/events": {
    post: {
      summary: "Append a session event",
      parameters: [
        {
          name: "session_id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: refOrInline("SessionEvent") } },
      },
      responses: {
        202: {
          description: "Accepted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { accepted: { type: "boolean", const: true } },
              },
            },
          },
        },
        ...err(404, "Unknown session"),
      },
    },
  },
  "/api/sessions/{session_id}/finalize": {
    post: {
      summary: "Finalize a session",
      parameters: [
        {
          name: "session_id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: refOrInline("Finalize") } },
      },
      responses: { 200: ok("Session") },
    },
  },
  "/api/adapters": {
    get: {
      summary: "List registered device adapters",
      responses: { 200: ok("AdaptersList") },
    },
  },
  "/api/modules": {
    get: { summary: "List loaded modules", responses: { 200: ok("ModulesList") } },
  },
};

const doc = {
  openapi: "3.1.0",
  info: {
    title: "OpenLabOS API",
    version: "0.1.0",
    description:
      "Coordination plane for OpenLabOS: sessions, adapters, modules, and the contracts the rest of the stack depends on.",
  },
  servers: [{ url: "http://localhost:3847" }],
  components,
  paths,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
