import { Badge, SectionLabel } from "../../../ui";
import {
  compactTitle,
  formatTokens,
  sourceWindowLabel,
  tokenBudget,
} from "./model";
import type { SourceVideoGroup } from "./types";

export function SourcePicker({
  sourceGroups,
  selectedSource,
  fps,
  onChooseSource,
}: {
  sourceGroups: SourceVideoGroup[];
  selectedSource?: SourceVideoGroup;
  fps: number;
  onChooseSource: (group: SourceVideoGroup) => void;
}) {
  return (
    <div className="rounded-2xl border border-highlight-border/25 bg-highlight-bg/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <SectionLabel>Step 1: Choose The Source Video</SectionLabel>
          <p className="text-xs text-muted leading-relaxed">
            Pick the full tutorial/source first. Segments below are clipped windows extracted from this one source video.
          </p>
        </div>
        <Badge color="blue">{sourceGroups.length} source videos</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 max-h-[30rem] overflow-y-auto pr-1">
        {sourceGroups.map((group, index) => {
          const active = group.sourceId === selectedSource?.sourceId;
          const sourceTokens = tokenBudget(group.samples, fps);
          return (
            <button
              key={group.sourceId}
              type="button"
              aria-pressed={active}
              onClick={() => onChooseSource(group)}
              className={[
                "group text-left rounded-xl border transition-all overflow-hidden bg-border/10 hover:bg-border/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                active ? "border-emerald-400/90 ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-950/20" : "border-border/15",
              ].join(" ")}
            >
              <div className="relative bg-black aspect-video">
                {group.thumbnailUrl ? (
                  <img src={group.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[11px] text-muted">
                    source video
                  </div>
                )}
                <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  Source {index + 1}
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {group.samples.length} clips
                </span>
                {active && (
                  <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accentFg">
                    selected
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="text-xs font-semibold text-fg leading-snug">{compactTitle(group.title)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge color="gray">{group.uploader || "source"}</Badge>
                  <Badge color="gray">{sourceWindowLabel(group)}</Badge>
                  <Badge color="blue">~{formatTokens(sourceTokens)} tok/pass</Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
