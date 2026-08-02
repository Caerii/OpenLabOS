import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";

function protocolExamplesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "examples/protocols"),
    path.resolve(process.cwd(), "../../examples/protocols"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

export function protocolsRoutes() {
  const app = new Hono();
  const dir = protocolExamplesDir();

  app.get("/", (c) => {
    const q = (c.req.query("q") ?? "").toLowerCase();
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(".protocol.json"))
      : [];
    const protocols = files
      .map((file) => {
        const raw = fs.readFileSync(path.join(dir, file), "utf8");
        const doc = JSON.parse(raw) as {
          protocol_id: string;
          protocol_version: string;
          name?: string;
          description?: string;
        };
        return {
          protocol_id: doc.protocol_id,
          protocol_version: doc.protocol_version,
          name: doc.name ?? doc.protocol_id,
          description: doc.description ?? "",
          path: file,
        };
      })
      .filter((p) =>
        !q
        || p.protocol_id.toLowerCase().includes(q)
        || (p.name ?? "").toLowerCase().includes(q),
      );
    return c.json({ protocols });
  });

  app.get("/:protocol_id", (c) => {
    const protocolId = c.req.param("protocol_id");
    const file = path.join(dir, `${protocolId}.protocol.json`);
    if (!fs.existsSync(file)) return c.json({ error: "protocol_not_found" }, 404);
    return c.json(JSON.parse(fs.readFileSync(file, "utf8")));
  });

  return app;
}
