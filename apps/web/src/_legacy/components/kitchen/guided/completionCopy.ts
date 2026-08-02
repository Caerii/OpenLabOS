import type { KitchenRunSummary } from "../../../api";

export function terminalRunStatusLabel(run: KitchenRunSummary | null) {
  if (run?.status === "aborted") return "Run stopped";
  if (run?.status === "completed") return "Run complete";
  return "Run review";
}

export function terminalRunOperatorMessage(run: KitchenRunSummary | null, savedManifestRef = "") {
  const partial = run?.status === "aborted";
  if (savedManifestRef) {
    return partial
      ? "The partial run is saved. Review it or start another attempt from step 1."
      : "The run is saved. Review it or start another attempt from step 1.";
  }
  return partial
    ? "Run stopped. Save the partial run before starting another attempt."
    : "Run complete. Save the run so it appears in the run library.";
}
