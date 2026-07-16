/**
 * Capability-aware adapter registry.
 *
 * The coordination API never names a device family in its routes. It asks
 * the registry "give me an adapter that can do `Capability.Camera` for
 * session X", and the registry returns the best match — currently
 * round-robin among healthy candidates, later ranked by latency / load.
 */
import type { Capability, DeviceAdapter } from "./types.js";

interface RegisteredAdapter {
  adapter: DeviceAdapter;
  capabilities: Capability[];
  registeredAt: string;
  /** Sticky binding from session id → adapter id to keep a run on one device. */
  pinned: Set<string>;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, RegisteredAdapter>();

  async register(adapter: DeviceAdapter): Promise<void> {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter "${adapter.id}" already registered`);
    }
    const capabilities = await adapter.capabilities();
    this.adapters.set(adapter.id, {
      adapter,
      capabilities,
      registeredAt: new Date().toISOString(),
      pinned: new Set(),
    });
  }

  unregister(adapterId: string): void {
    this.adapters.delete(adapterId);
  }

  list(): { id: string; capabilities: Capability[]; registeredAt: string }[] {
    return [...this.adapters.values()].map((r) => ({
      id: r.adapter.id,
      capabilities: r.capabilities,
      registeredAt: r.registeredAt,
    }));
  }

  /**
   * Resolve an adapter for a session. Honours pin (sticky) bindings; if no
   * pin exists, picks the first healthy adapter that supports every
   * requested capability.
   */
  async resolve(
    sessionId: string,
    required: Capability[],
  ): Promise<DeviceAdapter> {
    for (const r of this.adapters.values()) {
      if (r.pinned.has(sessionId)) return r.adapter;
    }

    const candidates = [...this.adapters.values()].filter((r) =>
      required.every((cap) => r.capabilities.includes(cap)),
    );
    if (candidates.length === 0) {
      throw new Error(
        `No adapter supports capabilities [${required.join(", ")}]`,
      );
    }

    for (const c of candidates) {
      const h = await c.adapter.health().catch(() => ({ ok: false }));
      if (h.ok) {
        c.pinned.add(sessionId);
        return c.adapter;
      }
    }
    throw new Error(
      `All adapters supporting [${required.join(", ")}] are unhealthy`,
    );
  }

  releaseSession(sessionId: string): void {
    for (const r of this.adapters.values()) r.pinned.delete(sessionId);
  }
}

export const globalAdapterRegistry = new AdapterRegistry();
