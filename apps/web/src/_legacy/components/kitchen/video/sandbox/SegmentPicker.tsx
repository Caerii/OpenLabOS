import { Badge, Btn, SectionLabel } from "../../../ui";
import {
  clipTimeLabel,
  estimateTokensForSegment,
  formatTokens,
} from "./model";
import type { KitchenDemoSampleWithFrames, SourceVideoGroup } from "./types";

export function SegmentPicker({
  selectedSource,
  selected,
  selectedIds,
  selectedCount,
  fps,
  onChooseSegment,
  onSelectAll,
  onSelectPrimaryOnly,
}: {
  selectedSource: SourceVideoGroup;
  selected: KitchenDemoSampleWithFrames;
  selectedIds: string[];
  selectedCount: number;
  fps: number;
  onChooseSegment: (sample: KitchenDemoSampleWithFrames) => void;
  onSelectAll: () => void;
  onSelectPrimaryOnly: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/15 bg-bg2/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <SectionLabel>Step 2: Choose A Segment From This Source</SectionLabel>
          <p className="text-xs text-muted leading-relaxed">
            Click cards to include or remove extracted windows. The storyboard below previews every selected segment; Focus only changes the large preview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn size="xs" variant="secondary" onClick={onSelectAll}>Select all</Btn>
          <Btn size="xs" variant="ghost" onClick={onSelectPrimaryOnly}>Primary only</Btn>
          <Badge color="green">{selectedCount} selected</Badge>
          <Badge color="green">{selectedSource.samples.length} extracted clips</Badge>
          <Badge color="gray">{selectedSource.protocolId}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {selectedSource.samples.map((sample, index) => {
          const active = selectedIds.includes(sample.sampleId);
          const primary = sample.sampleId === selected.sampleId;
          const estimate = estimateTokensForSegment(sample, fps);
          return (
            <button
              key={sample.sampleId}
              type="button"
              aria-pressed={active}
              onClick={() => onChooseSegment(sample)}
              className={[
                "text-left rounded-xl border bg-border/10 overflow-hidden transition-all hover:bg-border/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                active ? "border-emerald-400/90 ring-1 ring-emerald-400/50" : "border-border/15",
              ].join(" ")}
            >
              <div className="relative bg-black aspect-video">
                {sample.frameUrls?.[0] ? (
                  <img src={sample.frameUrls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[11px] text-muted">clip</div>
                )}
                <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  Segment {index + 1}
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {clipTimeLabel(sample)}
                </span>
                {active && (
                  <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accentFg">
                    {primary ? "primary" : "selected"}
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="text-xs font-semibold text-fg">{sample.stepHint || "tutorial segment"}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                  <Badge color="gray">{estimate.frames} frames</Badge>
                  <Badge color="blue">~{formatTokens(estimate.perCall)} tokens/call</Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selectedSource.originalVideoUrl && (
        <a
          className="mt-3 inline-block text-[11px] text-good-fg hover:text-highlight"
          href={selectedSource.originalVideoUrl}
          target="_blank"
          rel="noreferrer"
        >
          open full source tutorial
        </a>
      )}
    </div>
  );
}
