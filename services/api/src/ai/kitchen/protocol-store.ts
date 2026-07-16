/**
 * Persistence boundary for Kitchen protocols.
 *
 * Built-in protocols are supplied by the caller. User-created protocols are
 * loaded from disk and cached by this store. Keeping this logic outside
 * `protocols.ts` lets that file stay focused on protocol definitions.
 */

import fs from "fs";
import path from "path";

import { sortProtocolsForDisplay, validateProtocolShape } from "./protocol-domain.js";
import type { KitchenProtocol } from "./protocol-types.js";

export interface ProtocolStore {
  loadUserProtocols(): KitchenProtocol[];
  saveProtocol(protocol: KitchenProtocol): string;
  deleteProtocol(id: string): boolean;
  getProtocol(id: string): KitchenProtocol | undefined;
  listProtocols(): KitchenProtocol[];
}

export function createProtocolStore(builtinProtocols: KitchenProtocol[], protocolsDir: string): ProtocolStore {
  let userProtocols: KitchenProtocol[] = [];

  function ensureProtocolsDir() {
    if (!fs.existsSync(protocolsDir)) {
      fs.mkdirSync(protocolsDir, { recursive: true });
    }
  }

  function loadUserProtocols(): KitchenProtocol[] {
    ensureProtocolsDir();
    const files = fs.readdirSync(protocolsDir).filter((file) => file.endsWith(".json"));
    const loaded: KitchenProtocol[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(protocolsDir, file), "utf-8");
        const result = validateProtocolShape(JSON.parse(raw));
        if (result.ok) {
          loaded.push(result.protocol);
        } else {
          console.warn(`[Kitchen] Invalid protocol ${file}:`, result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
        }
      } catch (e) {
        console.warn(`[Kitchen] Failed to load protocol ${file}:`, (e as Error).message);
      }
    }

    userProtocols = loaded;
    return loaded;
  }

  function saveProtocol(protocol: KitchenProtocol): string {
    const result = validateProtocolShape(protocol);
    if (!result.ok) {
      throw new Error(`Invalid protocol: ${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    }

    ensureProtocolsDir();
    const filepath = path.join(protocolsDir, `${protocol.id}.json`);
    fs.writeFileSync(filepath, JSON.stringify(protocol, null, 2), "utf-8");

    const existing = userProtocols.findIndex((candidate) => candidate.id === protocol.id);
    if (existing >= 0) {
      userProtocols[existing] = protocol;
    } else {
      userProtocols.push(protocol);
    }

    return filepath;
  }

  function deleteProtocol(id: string): boolean {
    if (builtinProtocols.some((protocol) => protocol.id === id)) {
      return false;
    }

    const filepath = path.join(protocolsDir, `${id}.json`);
    if (!fs.existsSync(filepath)) {
      return false;
    }

    fs.unlinkSync(filepath);
    userProtocols = userProtocols.filter((protocol) => protocol.id !== id);
    return true;
  }

  function getProtocol(id: string): KitchenProtocol | undefined {
    return builtinProtocols.find((protocol) => protocol.id === id)
      ?? userProtocols.find((protocol) => protocol.id === id);
  }

  function listProtocols(): KitchenProtocol[] {
    return sortProtocolsForDisplay([...builtinProtocols, ...userProtocols]);
  }

  return {
    loadUserProtocols,
    saveProtocol,
    deleteProtocol,
    getProtocol,
    listProtocols,
  };
}
