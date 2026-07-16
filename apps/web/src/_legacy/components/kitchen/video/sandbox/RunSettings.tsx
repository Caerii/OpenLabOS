import { Badge, SectionLabel } from "../../../ui";
import {
  formatTokens,
  PRIMITIVE_SUITE_CALLS,
  tokenBudget,
} from "./model";
import type { DemoMode, KitchenDemoSampleWithFrames } from "./types";

export function RunSettings({
  selectedSegments,
  fps,
  stepNumber,
  demoMode,
  onFpsChange,
  onStepNumberChange,
}: {
  selectedSegments: KitchenDemoSampleWithFrames[];
  fps: number;
  stepNumber: number;
  demoMode: DemoMode;
  onFpsChange: (value: number) => void;
  onStepNumberChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/15 bg-border/10 p-3 h-fit">
      <SectionLabel>Step 4: Run Settings</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-border/15 bg-bg2/70 p-2">
          <div className="text-[10px] uppercase tracking-wide text-subtle">Selected</div>
          <div className="text-sm font-semibold text-fg">{selectedSegments.length} segments</div>
        </div>
        <div className="rounded-lg border border-border/15 bg-bg2/70 p-2">
          <div className="text-[10px] uppercase tracking-wide text-subtle">Per Summary</div>
          <div className="text-sm font-semibold text-fg">~{formatTokens(tokenBudget(selectedSegments, fps))}</div>
        </div>
        <div className="rounded-lg border border-border/15 bg-bg2/70 p-2">
          <div className="text-[10px] uppercase tracking-wide text-subtle">Multiscale</div>
          <div className="text-sm font-semibold text-fg">~{formatTokens(tokenBudget(selectedSegments, fps, 2))}</div>
        </div>
        <div className="rounded-lg border border-border/15 bg-bg2/70 p-2">
          <div className="text-[10px] uppercase tracking-wide text-subtle">Full Suite</div>
          <div className="text-sm font-semibold text-fg">~{formatTokens(tokenBudget(selectedSegments, fps, PRIMITIVE_SUITE_CALLS))}</div>
        </div>
      </div>
      <div className="space-y-3 mt-2">
        <label className="space-y-1 block">
          <span className="text-[11px] text-muted">Protocol step to judge</span>
          <input
            type="number"
            min={1}
            max={12}
            className="w-full bg-surface-2 border border-border/25 rounded-lg text-fg text-xs px-3 py-2"
            value={stepNumber}
            onChange={(event) => onStepNumberChange(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-[11px] text-muted">Video FPS</span>
          <input
            type="number"
            min={1}
            max={8}
            className="w-full bg-surface-2 border border-border/25 rounded-lg text-fg text-xs px-3 py-2"
            value={fps}
            onChange={(event) => onFpsChange(Math.max(1, Number(event.target.value) || 2))}
          />
        </label>

        <div className="rounded-lg bg-bg2/70 border border-border/15 p-2 text-[11px] text-muted">
          Token numbers are heuristic estimates for demo planning: sampled frames x visual-token estimate plus prompt overhead. Actual provider billing/usage can differ.
          {demoMode === "api" ? " The backend sends the video chunk to ER/Gemini." : " Static mode replays bundled assets."}
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge color="gray">fps {fps}</Badge>
          <Badge color="gray">step {stepNumber}</Badge>
        </div>
      </div>
    </div>
  );
}
