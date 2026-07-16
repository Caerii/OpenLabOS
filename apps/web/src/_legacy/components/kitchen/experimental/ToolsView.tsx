import { Card, CardHeader, CardTitle, Badge, Icon, SectionLabel, ActionCard, SearchInput } from "../../ui/index";
import { ICON } from "../icons";
import {
  kitchenAnalyzeSpatial, kitchenAnalyzeObjects, kitchenAnalyzeBoxes,
  kitchenAnalyzeSafety, kitchenAnalyzeHands, kitchenAnalyzeCount,
  kitchenAnalyzeTrajectory, kitchenAnalyzeInstrument, kitchenAnalyzeLiquidLevel,
  kitchenAnalyzeWorkspaceClear, kitchenAnalyzeSuccessCheck, kitchenAnalyzeBeforeAfter,
  kitchenAnalyzeEntitySegmentation,
  type ERAnalysisResult,
} from "../../../api";

const ER_TOOLS = [
  { id: "spatial", title: "Spatial Inventory", description: "Detect and locate all objects in the workspace", icon: ICON.grid,
    action: (run: any) => run("spatial", () => kitchenAnalyzeSpatial({ maxItems: 20 })) },
  { id: "boxes", title: "Bounding Boxes", description: "Full object detection with labeled regions", icon: ICON.bbox,
    action: (run: any) => run("boxes", () => kitchenAnalyzeBoxes({ maxObjects: 20 })) },
  { id: "entities", title: "Entity Masks & Tracks", description: "Segment protocol objects into persistent entities for overlays and training labels", icon: ICON.bbox,
    action: (run: any) => {
      const objs = prompt("Objects to segment/track (comma-separated):", "mug, kettle, tea bag, spoon, hand");
      if (objs) run("entity-segmentation", () => kitchenAnalyzeEntitySegmentation(objs.split(",").map(s => s.trim()), { includeMasks: true, includeTracks: true }));
    } },
  { id: "hands", title: "Hand Tracking", description: "Detect hands, grip type, and current action", icon: ICON.hand,
    action: (run: any) => run("hands", () => kitchenAnalyzeHands()) },
  { id: "safety", title: "Safety Check", description: "Detect kitchen hazards and unsafe conditions", icon: ICON.alert,
    action: (run: any) => run("safety", () => kitchenAnalyzeSafety("general kitchen activity")) },
  { id: "count", title: "Object Counting", description: "Count specific items in the scene", icon: ICON.hash,
    action: (run: any) => { const obj = prompt("What object to count?", "cup"); if (obj) run("count", () => kitchenAnalyzeCount(obj)); } },
  { id: "find", title: "Find Objects", description: "Locate specific named objects", icon: ICON.search,
    action: (run: any) => { const objs = prompt("Objects to find (comma-separated):", "knife, mug, cutting board"); if (objs) run("objects", () => kitchenAnalyzeObjects(objs.split(",").map(s => s.trim()))); } },
  { id: "trajectory", title: "Trajectory Plan", description: "Plan a hand/object movement path between two objects", icon: ICON.play,
    action: (run: any) => { const from = prompt("Move from object:", "kettle"); const to = prompt("Move to object:", "mug"); if (from && to) run("trajectory", () => kitchenAnalyzeTrajectory(from, to, { numPoints: 10 })); } },
  { id: "instrument", title: "Instrument Read", description: "Read timers, thermometers, kettle displays, or markings", icon: ICON.clock,
    action: (run: any) => { const instrument = prompt("Instrument/display to read:", "timer or kettle temperature display"); if (instrument) run("instrument", () => kitchenAnalyzeInstrument(instrument)); } },
  { id: "liquid", title: "Liquid Level", description: "Estimate fill percentage and volume in a container", icon: ICON.hash,
    action: (run: any) => { const container = prompt("Container to measure:", "mug"); if (container) run("liquid-level", () => kitchenAnalyzeLiquidLevel(container)); } },
  { id: "workspace", title: "Workspace Clear", description: "Identify what must move to make room for a target object", icon: ICON.grid,
    action: (run: any) => { const target = prompt("Need counter space for:", "tea tray"); if (target) run("workspace-clear", () => kitchenAnalyzeWorkspaceClear(target)); } },
  { id: "success", title: "Success Check", description: "Ask a closed-world yes/no verification question", icon: ICON.check,
    action: (run: any) => { const verificationPrompt = prompt("Verification prompt:", "Did the person place the mug on the counter? Return JSON with success, confidence, and reasoning."); if (verificationPrompt) run("success-check", () => kitchenAnalyzeSuccessCheck(verificationPrompt)); } },
  { id: "before-after", title: "Before/After", description: "Compare two image URLs to verify a visual state change", icon: ICON.bbox,
    action: (run: any) => {
      const beforeImageUrl = prompt("Before image URL:");
      const afterImageUrl = prompt("After image URL:");
      const taskDescription = prompt("Task to verify:", "Place the mug on the counter");
      if (beforeImageUrl && afterImageUrl && taskDescription) {
        run("before-after", () => kitchenAnalyzeBeforeAfter(taskDescription, { beforeImageUrl, afterImageUrl }));
      }
    } },
];

function AnalysisResult({ result }: { result: ERAnalysisResult }) {
  const parsed = result.parsed;
  const isArray = Array.isArray(parsed);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle sub={`${result.latencyMs}ms`}>Analysis Result</CardTitle>
        <Badge color="gray">{result.mode}</Badge>
      </CardHeader>
      {isArray && parsed.length > 0 ? (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {parsed.map((det: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-border/10 border border-border/15 text-xs">
              {det.point && <span className="font-mono text-[10px] text-muted w-20 shrink-0">[{det.point.join(",")}]</span>}
              {det.box_2d && <span className="font-mono text-[10px] text-muted w-28 shrink-0">[{det.box_2d.join(",")}]</span>}
              <span className="text-fg">{det.label}</span>
            </div>
          ))}
        </div>
      ) : parsed && !parsed.parseError ? (
        <pre className="text-xs text-muted whitespace-pre-wrap bg-border/10 border border-border/15 rounded-lg p-3 max-h-64 overflow-y-auto font-mono leading-relaxed">
          {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
        </pre>
      ) : (
        <pre className="text-xs text-muted whitespace-pre-wrap bg-border/10 border border-border/15 rounded-lg p-3 max-h-48 overflow-y-auto font-mono">
          {result.raw?.slice(0, 1000)}
        </pre>
      )}
    </Card>
  );
}

export default function ToolsView({ analyzing, lastResult, searchQuery, searchResult, searching, onRunAnalysis, onSearchQueryChange, onSearch }: {
  analyzing: boolean;
  lastResult: ERAnalysisResult | null;
  searchQuery: string;
  searchResult: any;
  searching: boolean;
  onRunAnalysis: (name: string, fn: () => Promise<any>) => void;
  onSearchQueryChange: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-5 animate-fade-in">
      <SectionLabel>Analysis Modes</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ER_TOOLS.map((tool) => (
          <ActionCard
            key={tool.id}
            icon={<Icon d={tool.icon} size={15} className="text-muted group-hover:text-highlight transition-colors" />}
            title={tool.title}
            description={tool.description}
            loading={analyzing}
            onClick={() => tool.action(onRunAnalysis)}
          />
        ))}
      </div>

      {/* Google Search Grounding */}
      <Card>
        <CardHeader>
          <CardTitle icon={<Icon d={ICON.globe} size={16} className="text-blue-400" />} sub="Real-time web results via Gemini">
            Google Search Grounding
          </CardTitle>
        </CardHeader>
        <SearchInput
          value={searchQuery}
          onChange={onSearchQueryChange}
          onSubmit={onSearch}
          placeholder="Ask anything about cooking, recipes, techniques..."
          loading={searching}
        />
        {searchResult && (
          <div className="mt-3 p-3 rounded-lg bg-border/10 border border-border/15 text-xs text-muted max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {searchResult.raw}
            {searchResult.sources?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/20 flex items-center gap-1">
                <Icon d={ICON.globe} size={10} className="text-subtle" />
                <span className="text-[10px] text-subtle">{searchResult.sources.length} sources</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {lastResult && <AnalysisResult result={lastResult} />}
    </div>
  );
}
