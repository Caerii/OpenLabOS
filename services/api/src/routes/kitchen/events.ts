/**
 * Event and snapshot helpers for Kitchen route mutations.
 */

import { protocolTracker } from "../../ai/kitchen/index.js";
import { appendKitchenEvent, type KitchenRunEventType } from "../../ai/kitchen/run-store.js";
import { getKitchenRouteDeps } from "./deps.js";

export function queueKitchenEvent(event: Parameters<typeof appendKitchenEvent>[0]) {
  void getKitchenRouteDeps().appendKitchenEvent(event).catch(() => {});
}

export function queueKitchenSnapshot(run = protocolTracker.getCurrentRun()) {
  void getKitchenRouteDeps().saveCurrentRunSnapshot(run, protocolTracker.summary).catch(() => {});
}

export function recordKitchenRunEvent(
  type: KitchenRunEventType,
  run: { id?: string; protocolId?: string } | null | undefined,
  payload?: Record<string, unknown>,
  snapshotRun = protocolTracker.getCurrentRun(),
) {
  queueKitchenEvent({
    type,
    runId: run?.id ?? null,
    protocolId: run?.protocolId ?? null,
    ...(payload ? { payload } : {}),
  });
  queueKitchenSnapshot(snapshotRun);
}

