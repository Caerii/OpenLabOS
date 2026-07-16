import { getKitchenRouteDeps } from "./deps.js";
import {
  cleanupTerminalKitchenRunWithPorts,
  type KitchenTerminalCleanupResult,
} from "../../ai/kitchen/application/terminal-cleanup.js";

export async function cleanupTerminalKitchenRun(opts: {
  runId?: string | null;
  reason: "run_completed" | "run_aborted";
  saveManifest?: boolean;
}): Promise<KitchenTerminalCleanupResult> {
  const deps = getKitchenRouteDeps();
  return cleanupTerminalKitchenRunWithPorts(deps, opts);
}
