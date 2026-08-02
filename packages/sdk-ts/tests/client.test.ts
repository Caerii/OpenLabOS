import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

describe("@openlabos/sdk-ts", () => {
  it("exports a client facade", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
  });

  it("openapi document exists when emitted", () => {
    const openapi = path.resolve("openapi.json");
    if (existsSync(openapi)) {
      const doc = JSON.parse(readFileSync(openapi, "utf8"));
      expect(doc.openapi).toBeTruthy();
    }
  });
});
