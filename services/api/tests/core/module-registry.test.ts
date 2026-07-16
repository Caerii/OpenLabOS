/**
 * Pure-data module manifests. The registry rejects collisions across
 * modules and exposes lookups by criterion kind and vocabulary id.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModuleRegistry } from "../../src/core/modules/registry.js";
import type { ModuleManifest } from "../../src/core/modules/manifest.js";

const biotech: ModuleManifest = {
  id: "biotech",
  version: "0.1.0",
  description: "biotech vocabulary + criteria",
  vocabulary: {
    objects: [{ id: "object:eppendorf-1.5ml", label: "Eppendorf tube" }],
    reagents: [{ id: "reagent:tris-buffer", label: "Tris buffer" }],
  },
  criteria: [
    {
      kind: "tube_centrifuged",
      schema: z.object({ rcf: z.number().positive() }),
      verify: () => ({ satisfied: true, evidence: "spin-down inferred" }),
    },
  ],
};

const chemistry: ModuleManifest = {
  id: "chemistry",
  version: "0.1.0",
  description: "chemistry vocabulary",
  vocabulary: { reagents: [{ id: "reagent:naoh-1m", label: "NaOH 1 M" }] },
};

describe("ModuleRegistry", () => {
  it("registers a manifest and indexes its criteria + vocabulary", () => {
    const r = new ModuleRegistry();
    r.register(biotech);
    expect(r.get("biotech")?.id).toBe("biotech");
    expect(r.criterion("tube_centrifuged")?.kind).toBe("tube_centrifuged");
    expect(r.ownerOf("object:eppendorf-1.5ml")).toBe("biotech");
  });

  it("rejects duplicate criterion kinds across modules", () => {
    const r = new ModuleRegistry();
    r.register(biotech);
    expect(() =>
      r.register({ ...biotech, id: "biotech-fork" }),
    ).toThrow(/already provided by another module/);
  });

  it("rejects vocabulary id collisions across modules", () => {
    const r = new ModuleRegistry();
    r.register(biotech);
    expect(() =>
      r.register({
        ...chemistry,
        vocabulary: {
          reagents: [{ id: "reagent:tris-buffer", label: "Tris (forked)" }],
        },
      }),
    ).toThrow(/already owned/);
  });

  it("rejects malformed manifests", () => {
    const r = new ModuleRegistry();
    expect(() => r.register({} as ModuleManifest)).toThrow(/Invalid module manifest/);
  });
});
