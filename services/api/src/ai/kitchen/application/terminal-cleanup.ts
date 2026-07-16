export interface KitchenTerminalCleanupResult {
  recordingStopped: boolean;
  manifestSaved: boolean;
  manifestRef?: string;
  errors: string[];
}

export interface KitchenTerminalCleanupPorts {
  stopNativeRecording: (reason?: string) => Promise<unknown>;
  saveKitchenSessionManifest: (runId?: string) => Promise<{ manifestRef?: string }>;
}

export async function cleanupTerminalKitchenRunWithPorts(
  ports: KitchenTerminalCleanupPorts,
  opts: {
    runId?: string | null;
    reason: "run_completed" | "run_aborted";
    saveManifest?: boolean;
  },
): Promise<KitchenTerminalCleanupResult> {
  const errors: string[] = [];
  let recordingStopped = false;
  let manifestSaved = false;
  let manifestRef: string | undefined;

  try {
    await ports.stopNativeRecording(opts.reason);
    recordingStopped = true;
  } catch (error: any) {
    errors.push(`recording_stop:${error?.message || String(error)}`);
  }

  if (opts.saveManifest !== false && opts.runId) {
    try {
      const saved = await ports.saveKitchenSessionManifest(opts.runId);
      manifestSaved = true;
      manifestRef = saved.manifestRef;
    } catch (error: any) {
      errors.push(`manifest_save:${error?.message || String(error)}`);
    }
  }

  return { recordingStopped, manifestSaved, manifestRef, errors };
}
