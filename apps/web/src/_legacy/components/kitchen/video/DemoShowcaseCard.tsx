import { Badge, Card, CardHeader, CardTitle, Icon, TagList } from "../../ui";
import { ICON } from "../icons";
import { DEMO_EXAMPLES, type DemoExample } from "../demoExamples";

export function DemoShowcaseCard({ onSelect }: { onSelect: (ex: DemoExample) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Icon d={ICON.play} size={16} className="text-accentText" />}
          sub="Real ER 1.6 extraction results from YouTube cooking videos"
        >
          Demo Showcase
        </CardTitle>
        <Badge color="green">Real Data</Badge>
      </CardHeader>
      <p className="text-xs text-muted mb-4 leading-relaxed">
        These protocols were extracted from real YouTube videos by Gemini Robotics ER 1.6. Click any example to view the full extraction result — no API call
        needed.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEMO_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            className="text-left p-4 rounded-xl bg-surface-2 border border-border/20 hover:border-highlight-border/20 hover:bg-surface-3 transition-all group"
            onClick={() => onSelect(ex)}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-border/10 border border-border/20 flex items-center justify-center text-xl group-hover:bg-highlight-bg/10 group-hover:border-highlight-border/20 transition-all">
                {ex.thumbnailEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[13px] font-medium text-fg group-hover:text-accentText transition-colors">{ex.title}</h4>
                <p className="text-[11px] text-muted truncate">{ex.protocol.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-subtle">
              <span>{ex.protocol.steps.length} steps</span>
              <span>&middot;</span>
              <span>~{ex.protocol.estimatedMinutes}min</span>
              <span>&middot;</span>
              <span>{ex.latencyMs}ms extraction</span>
            </div>
            <div className="mt-2">
              <TagList items={ex.protocol.requiredInventory.map((i) => i.name)} />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

