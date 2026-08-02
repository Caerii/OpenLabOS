/**
 * Canonical media/session path construction per ADR 0014. Routes and stores
 * must use these helpers — never invent ad-hoc path schemes.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openLabosDataDir } from "../data-root.js";

export function sessionsDir(): string {
  return path.join(openLabosDataDir(), "sessions");
}

export function sessionRootPath(sessionId: string): string {
  return path.join(sessionsDir(), sessionId);
}

export function sessionEventsPath(sessionId: string): string {
  return path.join(sessionRootPath(sessionId), "events.jsonl");
}

export function sessionManifestPath(sessionId: string): string {
  return path.join(sessionRootPath(sessionId), "manifest.json");
}

export function sessionFramePath(sessionId: string, stepId: string, frameSeq: number): string {
  return path.join(sessionRootPath(sessionId), "frames", stepId, `${frameSeq}.jpg`);
}

export function sessionJudgmentPath(sessionId: string, judgmentId: string): string {
  return path.join(sessionRootPath(sessionId), "judgments", `${judgmentId}.json`);
}

export function protocolPath(protocolId: string, version: string): string {
  return path.join(openLabosDataDir(), "protocols", protocolId, version, "protocol.json");
}

export function toFileUri(absolutePath: string): string {
  return pathToFileURL(absolutePath).href;
}

export function runsIndexPath(): string {
  return path.join(sessionsDir(), "index.json");
}
