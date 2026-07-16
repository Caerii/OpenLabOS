import { VisionSectionCard } from "./VisionSectionCard";

interface CompareAgreement {
  objectOverlap: number;
  sceneWordOverlap: number;
  sharedObjects?: string[];
  activityAgreement?: boolean;
  activities?: string[];
}

interface Props {
  connected: boolean;
  modelCount: number;
  comparing: boolean;
  compareResult: { agreement?: CompareAgreement } | null;
  onCompare: () => void;
}

export function VisionCompareCard({
  connected,
  modelCount,
  comparing,
  compareResult,
  onCompare,
}: Props) {
  const agreement = compareResult?.agreement;

  return (
    <VisionSectionCard title="Multi-Model Compare">
      <p className="text-xs text-muted mb-3">
        Run all available models on the same frame to measure inter-annotator agreement.
      </p>
      <button
        type="button"
        className="btn-primary w-full mb-3"
        onClick={onCompare}
        disabled={comparing || !connected || modelCount < 2}
      >
        {comparing ? "Comparing..." : `Compare ${Math.min(modelCount, 3)} Models`}
      </button>
      {agreement && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-surface-1 border border-border/15 text-center">
              <div className="text-lg font-mono font-bold text-labos-green">
                {(agreement.objectOverlap * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Object Agreement</div>
            </div>
            <div className="p-2 rounded bg-surface-1 border border-border/15 text-center">
              <div className="text-lg font-mono font-bold text-blue-400">
                {(agreement.sceneWordOverlap * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Scene Overlap</div>
            </div>
          </div>
          <div className="text-xs text-muted">
            Shared objects: {agreement.sharedObjects?.join(", ") || "none"}
          </div>
          <div className="text-xs text-muted">
            Activity agreement: {agreement.activityAgreement ? "yes" : "no"}
            {agreement.activities && agreement.activities.length > 0 && (
              <> — {agreement.activities.join(" vs ")}</>
            )}
          </div>
        </div>
      )}
    </VisionSectionCard>
  );
}
