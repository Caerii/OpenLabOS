import { Badge, Btn, SectionLabel } from "../../../ui";
import {
  clipTimeLabel,
  estimateTokensForSegment,
  formatTokens,
  previewUrlForSegment,
  tokenBudget,
} from "./model";
import type { DemoMode, KitchenDemoSampleWithFrames } from "./types";

function FrameStrip({
  frames,
  clipIndex,
}: {
  frames: string[];
  clipIndex: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {frames.length ? frames.map((frameUrl, frameIndex) => (
        <figure key={frameUrl} className="rounded-md overflow-hidden border border-border/15 bg-black">
          <img
            src={frameUrl}
            alt={`Clip ${clipIndex + 1} frame ${frameIndex + 1}`}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
          <figcaption className="px-1.5 py-0.5 text-[9px] text-subtle bg-bg2/90">
            f{frameIndex + 1}
          </figcaption>
        </figure>
      )) : (
        <div className="col-span-2 rounded-md border border-border/15 bg-bg2/70 p-2 text-[10px] text-muted">
          No frame strip for this clip.
        </div>
      )}
    </div>
  );
}

export function BatchPreview({
  selected,
  selectedSegments,
  selectedPreviewUrl,
  demoMode,
  fps,
  onFocusSegment,
}: {
  selected: KitchenDemoSampleWithFrames;
  selectedSegments: KitchenDemoSampleWithFrames[];
  selectedPreviewUrl: string;
  demoMode: DemoMode;
  fps: number;
  onFocusSegment: (segment: KitchenDemoSampleWithFrames) => void;
}) {
  return (
    <div className="rounded-xl border border-border/15 bg-border/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <SectionLabel>Step 3: Preview Selected Batch</SectionLabel>
          <p className="text-xs text-muted leading-relaxed">
            Every selected clip is visible as a storyboard. Focus changes the large player only; analysis buttons still run on the full selected batch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color="green">{selectedSegments.length} selected</Badge>
          <Badge color="blue">~{formatTokens(tokenBudget(selectedSegments, fps))} tok/pass</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border/15 bg-bg2/70 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-subtle">Focused preview</div>
            <div className="text-sm font-semibold text-fg">{selected.stepHint || "tutorial segment"}</div>
            <p className="text-[11px] text-muted leading-relaxed">{selected.title}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge color="blue">{selected.protocolId}</Badge>
            <Badge color="gray">{clipTimeLabel(selected)}</Badge>
            <Badge color="gray">{estimateTokensForSegment(selected, fps).frames} frames</Badge>
          </div>
        </div>

        {selected.notes && <p className="text-[11px] text-subtle mt-2">{selected.notes}</p>}

        {selectedPreviewUrl ? (
          <video
            className="mt-3 w-full max-h-80 rounded-lg border border-border/15 bg-black"
            controls
            playsInline
            preload="metadata"
            src={selectedPreviewUrl}
          />
        ) : selected.frameUrls?.[0] ? (
          <img
            src={selected.frameUrls[0]}
            alt="Focused clip preview"
            className="mt-3 w-full max-h-80 rounded-lg border border-border/15 bg-black object-contain"
          />
        ) : (
          <div className="mt-3 rounded-lg border border-border/15 bg-bg2/60 p-4 text-xs text-muted">
            Preview media is unavailable for this clip, but backend analysis can still use the configured source URL.
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-subtle">Selected batch storyboard</div>
            <div className="text-[11px] text-muted">Preview all clips that will be sent to the analysis actions.</div>
          </div>
          <Badge color="gray">{selected.uploader || "source"}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[38rem] overflow-y-auto pr-1">
          {selectedSegments.map((segment, index) => {
            const previewUrl = previewUrlForSegment(segment, demoMode);
            const estimate = estimateTokensForSegment(segment, fps);
            const primary = segment.sampleId === selected.sampleId;
            const frames = (segment.frameUrls || []).slice(0, 4);

            return (
              <div
                key={segment.sampleId}
                className={[
                  "rounded-xl border bg-border/10 p-2",
                  primary ? "border-emerald-400/80 ring-1 ring-emerald-400/40" : "border-border/15",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-subtle">Clip {index + 1}</div>
                    <div className="text-xs font-semibold text-fg">{segment.stepHint || "tutorial segment"}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge color="gray">{clipTimeLabel(segment)}</Badge>
                      <Badge color="blue">~{formatTokens(estimate.perCall)} tok</Badge>
                    </div>
                  </div>
                  <Btn
                    size="xs"
                    variant={primary ? "secondary" : "ghost"}
                    onClick={() => onFocusSegment(segment)}
                  >
                    {primary ? "Focused" : "Focus"}
                  </Btn>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem] gap-2">
                  <div className="rounded-lg overflow-hidden border border-border/15 bg-black">
                    {previewUrl ? (
                      <video
                        className="w-full aspect-video object-contain bg-black"
                        controls
                        playsInline
                        preload="metadata"
                        src={previewUrl}
                      />
                    ) : segment.frameUrls?.[0] ? (
                      <img
                        src={segment.frameUrls[0]}
                        alt={`Clip ${index + 1} preview`}
                        className="w-full aspect-video object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="aspect-video flex items-center justify-center text-[11px] text-muted">
                        no preview
                      </div>
                    )}
                  </div>

                  <FrameStrip frames={frames} clipIndex={index} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {demoMode === "static" && selected.originalVideoUrl && (
        <a
          className="mt-2 inline-block text-[11px] text-good-fg hover:text-highlight"
          href={selected.originalVideoUrl}
          target="_blank"
          rel="noreferrer"
        >
          source tutorial
        </a>
      )}
    </div>
  );
}
