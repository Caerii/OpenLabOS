import { InMemorySessionStore, type SessionStore } from "./store.js";
import { FilesystemSessionStore } from "./filesystem-store.js";

let sharedStore: SessionStore | null = null;

export function createSessionStore(env: NodeJS.ProcessEnv = process.env): SessionStore {
  const tier = (env.OPENLABOS_STORAGE_TIER ?? "filesystem").toLowerCase();
  if (tier === "memory") return new InMemorySessionStore();
  if (!sharedStore) {
    sharedStore = new FilesystemSessionStore();
  }
  return sharedStore;
}

export function closeSessionStore(): void {
  if (sharedStore && "close" in sharedStore && typeof sharedStore.close === "function") {
    sharedStore.close();
  }
  sharedStore = null;
}
