/**
 * Shared Express mutation wrapper for Kitchen run routes.
 */

import type { Request, Response, Router } from "express";
import { protocolTracker } from "../../ai/kitchen/index.js";
import type { KitchenRunEventType } from "../../ai/kitchen/run-store.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { recordKitchenRunEvent } from "./events.js";

export function userActionRoute(handler: (req: Request, res: Response) => Promise<void> | void) {
  return asyncRoute(async (req, res) => {
    try {
      await handler(req, res);
    } catch (e: any) {
      badRequest(e.message);
    }
  });
}

export type RunMutationOutcome = {
  eventType: KitchenRunEventType;
  eventRun?: { id?: string; protocolId?: string } | null;
  payload?: Record<string, unknown>;
  response: Record<string, unknown>;
  snapshotRun?: ReturnType<typeof protocolTracker.getCurrentRun>;
  warmCamera?: boolean;
  afterMutation?: () => Promise<void> | void;
};

export function postRunMutationRoute(
  router: Router,
  path: string,
  mutate: (req: Request) => RunMutationOutcome,
) {
  router.post(path, userActionRoute(async (req, res) => {
    const { eventType, eventRun, payload, response, snapshotRun, warmCamera, afterMutation } = mutate(req);
    recordKitchenRunEvent(eventType, eventRun, payload, snapshotRun);
    if (warmCamera) void getKitchenRouteDeps().warmKitchenProtocolCamera();
    await afterMutation?.();
    res.json(response);
  }));
}

