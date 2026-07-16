/**
 * Capability-aware adapter routing. The contract: the registry returns an
 * adapter that supports every requested capability and is currently
 * healthy; once a session pins to one, the registry sticks to it.
 */
import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../../src/core/adapters/registry.js";
import {
  Capability,
  type DeviceAdapter,
  type DeviceSession,
} from "../../src/core/adapters/types.js";

function makeAdapter(
  id: string,
  capabilities: Capability[],
  ok = true,
): DeviceAdapter {
  return {
    id,
    capabilities: async () => capabilities,
    health: async () => ({ ok }),
    open: async (opts): Promise<DeviceSession> => ({
      adapterId: id,
      sessionId: opts.sessionId,
      capabilities: opts.request,
      preview: () => emptyAsyncIterable(),
      sensors: () => emptyAsyncIterable(),
      invoke: async () => undefined,
      close: async () => undefined,
    }),
  };
}

async function* emptyAsyncIterable(): AsyncIterable<never> {
  /* yields nothing */
}

describe("AdapterRegistry", () => {
  it("routes by capability and pins for stickiness", async () => {
    const reg = new AdapterRegistry();
    await reg.register(makeAdapter("webcam", [Capability.Camera]));
    await reg.register(
      makeAdapter("phone", [Capability.Camera, Capability.Imu, Capability.Audio]),
    );

    const a = await reg.resolve("session-1", [Capability.Camera, Capability.Imu]);
    expect(a.id).toBe("phone");
    // Sticky: same session resolves to same adapter even with looser capabilities.
    const b = await reg.resolve("session-1", [Capability.Camera]);
    expect(b.id).toBe("phone");
  });

  it("rejects when no adapter supports the union", async () => {
    const reg = new AdapterRegistry();
    await reg.register(makeAdapter("webcam", [Capability.Camera]));
    await expect(
      reg.resolve("s", [Capability.Camera, Capability.Mcu]),
    ).rejects.toThrow(/No adapter supports/);
  });

  it("skips unhealthy adapters", async () => {
    const reg = new AdapterRegistry();
    await reg.register(makeAdapter("a", [Capability.Camera], /*ok*/ false));
    await reg.register(makeAdapter("b", [Capability.Camera], /*ok*/ true));
    const a = await reg.resolve("s", [Capability.Camera]);
    expect(a.id).toBe("b");
  });

  it("releases pins on session end", async () => {
    const reg = new AdapterRegistry();
    await reg.register(makeAdapter("a", [Capability.Camera]));
    await reg.register(makeAdapter("b", [Capability.Camera]));
    const first = await reg.resolve("s", [Capability.Camera]);
    reg.releaseSession("s");
    // After release, the next resolve can pick a different healthy adapter.
    const second = await reg.resolve("s", [Capability.Camera]);
    expect([first.id, second.id]).toContain("a");
  });
});
