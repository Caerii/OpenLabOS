import { useState } from "react";
import { systemShell, labosDeactivate } from "../api";
import { ConfirmDialog } from "./ui";

interface Props {
  connected: boolean;
}

const MENTRA_PACKAGES = [
  "com.mentra.launcher",
  "com.mentra.live",
  "com.mentra.settings",
  "com.mentra.camera",
  "com.mentra.gallery",
  "com.mentra.assistant",
  "com.mentra.onboarding",
  "com.mentra.notifications",
  "com.mentra.connectivity",
];

export default function MentraRestore({ connected }: Props) {
  const [output, setOutput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  function log(msg: string) {
    setOutput((o) => [...o, msg]);
  }

  async function runRestore() {
    setRestoreOpen(false);
    setBusy(true);
    setOutput([]);

    log("=== Mentra Stock Restore ===");

    // Step 1: Remove LabOS device owner
    log("[1/4] Removing LabOS device owner...");
    try {
      const r = await labosDeactivate();
      log(`  -> ${r.output || (r.success ? "Done" : "Failed")}`);
    } catch (e: any) {
      log(`  -> Error: ${e.message} (may not have been set)`);
    }

    // Step 2: Unhide/enable Mentra packages
    log("[2/4] Unhiding Mentra packages...");
    for (const pkg of MENTRA_PACKAGES) {
      try {
        await systemShell(`pm enable ${pkg}`);
        log(`  -> Enabled: ${pkg}`);
      } catch {
        log(`  -> Skip: ${pkg} (may not exist)`);
      }
    }

    // Step 3: Set Mentra launcher as default
    log("[3/4] Setting Mentra launcher as default home app...");
    try {
      // Clear current default launcher
      await systemShell("pm clear-default-browser-status com.openlab.labos.core").catch(() => {});
      // Try to set Mentra as preferred
      const r = await systemShell(
        "cmd package set-home-activity com.mentra.launcher/.MainActivity"
      );
      log(`  -> ${r.output || "Done"}`);
    } catch (e: any) {
      log(`  -> Note: ${e.message}`);
      log("  -> You may need to select Mentra launcher manually after reboot");
    }

    // Step 4: Stop LabOS
    log("[4/4] Force-stopping LabOS...");
    try {
      await systemShell("am force-stop com.openlab.labos.core");
      log("  -> Done");
    } catch (e: any) {
      log(`  -> ${e.message}`);
    }

    log("");
    log("Restore complete. You may want to reboot the glasses.");

    setBusy(false);
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore Mentra stock?"
        description="This removes LabOS device owner and restores the Mentra stock launcher. Continue only if you mean it."
        destructive
        confirmText="Continue"
        onConfirm={runRestore}
      />
      <div className="card">
        <h2 className="text-accentText font-semibold mb-2">Mentra Stock Restore</h2>
        <p className="text-sm text-muted mb-4">
          This will undo LabOS changes and restore the glasses to Mentra stock configuration:
        </p>
        <ul className="text-sm text-muted list-disc list-inside mb-4 space-y-1">
          <li>Remove LabOS device owner privileges</li>
          <li>Unhide/enable all Mentra stock packages</li>
          <li>Set Mentra launcher as default home app</li>
          <li>Force stop LabOS</li>
        </ul>
        <button
          className="btn-danger"
          onClick={() => setRestoreOpen(true)}
          disabled={busy}
        >
          {busy ? "Restoring..." : "Restore Mentra Stock"}
        </button>
      </div>

      {/* Mentra packages reference */}
      <div className="card">
        <h3 className="text-sm font-semibold text-fg mb-2">Mentra Packages</h3>
        <div className="space-y-1">
          {MENTRA_PACKAGES.map((pkg) => (
            <div key={pkg} className="font-mono text-xs text-muted">{pkg}</div>
          ))}
        </div>
      </div>

      {/* Output log */}
      {output.length > 0 && (
        <pre className="card text-xs font-mono text-muted whitespace-pre-wrap max-h-96 overflow-y-auto">
          {output.join("\n")}
        </pre>
      )}
    </div>
  );
}
