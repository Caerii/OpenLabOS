import { Badge } from "../ui";
import {
  runCompletionLabel,
  runNaturalLabel,
  runStatusLabel,
  type NumberedRunSummary,
} from "./runLibraryModel";
import { formatDateTime, statusColor } from "./runLibraryFormatting";

export function RunCard({
  run,
  selected,
  onSelect,
}: {
  run: NumberedRunSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        selected ? "border-highlight-border/35 bg-highlight-bg/10" : "border-border/15 bg-surface-2 hover:border-border/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">
            {runNaturalLabel(run.runNumber)} - {run.protocolName || run.protocolId || "Protocol run"}
          </div>
          <div className="mt-0.5 text-xs text-subtle">{formatDateTime(run.savedAt)}</div>
        </div>
        <Badge color={statusColor(run.status)}>{runStatusLabel(run.status)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge color="gray">{runCompletionLabel(run)}</Badge>
        {run.status === "aborted" && <Badge color="yellow">saved partial</Badge>}
      </div>
    </button>
  );
}
