import type { ExperimentRecord } from "../../api";
import { VisionSectionCard } from "./VisionSectionCard";

type ExperimentsResponse = {
  experiments: ExperimentRecord[];
  current: (ExperimentRecord & { pipelineId: string })[];
};

interface Props {
  experiments?: ExperimentsResponse | null;
}

export function VisionExperimentsCard({ experiments }: Props) {
  const current = experiments?.current;
  const list = experiments?.experiments ?? [];

  return (
    <VisionSectionCard title="Experiments">
      {current && current.length > 0 && (
        <div className="space-y-2 mb-3">
          {current.map((exp) => (
            <div key={exp.id} className="p-2 rounded bg-green-900/20 border border-green-800">
              <div className="text-xs text-green-400 mb-1">Active Experiment ({exp.pipelineId})</div>
              <div className="text-sm font-mono">{exp.id.slice(0, 20)}</div>
              <div className="text-xs text-muted mt-1">
                {exp.metrics.framesAnalyzed} frames, avg {exp.metrics.avgLatencyMs}ms
              </div>
            </div>
          ))}
        </div>
      )}
      {list.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {[...list].reverse().slice(0, 10).map((exp) => (
            <div key={exp.id} className="p-2 rounded bg-surface-1 border border-border/15 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono">{exp.config.modelId.split(":").pop()}</span>
                <span className="text-muted">{exp.metrics.framesAnalyzed} frames</span>
              </div>
              <div className="text-muted mt-0.5">
                avg {exp.metrics.avgLatencyMs}ms, {exp.metrics.errors} errors
                {exp.endedAt && <> — {Math.round((exp.endedAt - exp.startedAt) / 1000)}s duration</>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted text-xs">No experiments yet. Start a pipeline to create one.</p>
      )}
    </VisionSectionCard>
  );
}
