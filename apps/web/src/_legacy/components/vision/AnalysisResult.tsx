import type { FrameAnalysisResult } from "../../api";

/** Renders a single frame analysis result */
export function AnalysisResult({ result }: { result: FrameAnalysisResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted">
          Model: <span className="font-mono text-fg">{result.modelId}</span>
        </span>
        <span className="text-muted">
          Latency: <span className="font-mono text-labos-green">{result.latencyMs}ms</span>
        </span>
        <span className="text-muted">
          {new Date(result.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div>
        <div className="text-xs text-muted mb-1">Scene</div>
        <p className="text-sm">{result.scene}</p>
      </div>

      {result.objects.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Objects ({result.objects.length})</div>
          <div className="flex flex-wrap gap-1">
            {result.objects.map((obj, i) => (
              <span key={i} className="px-2 py-1 rounded bg-blue-900/30 text-info-fg text-xs">
                {obj.label}
                {obj.confidence ? ` (${(obj.confidence * 100).toFixed(0)}%)` : ""}
                {obj.region ? ` — ${obj.region}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.hands && result.hands.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Hands</div>
          <div className="flex flex-wrap gap-1">
            {result.hands.map((h, i) => (
              <span key={i} className="px-2 py-1 rounded bg-purple-900/30 text-purple-300 text-xs">
                {h.side} hand{h.gesture ? `: ${h.gesture}` : ""}
                {h.holding ? ` (holding ${h.holding})` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.text && result.text.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Detected Text</div>
          <div className="flex flex-wrap gap-1">
            {result.text.map((t, i) => (
              <span key={i} className="px-2 py-1 rounded bg-yellow-900/30 text-yellow-300 text-xs font-mono">
                "{t}"
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {result.activity && (
          <div className="p-2 rounded bg-surface-1 border border-border/15">
            <div className="text-xs text-muted">Activity</div>
            <div className="text-sm">{result.activity}</div>
          </div>
        )}
        {result.gazeTarget && (
          <div className="p-2 rounded bg-surface-1 border border-border/15">
            <div className="text-xs text-muted">Gaze Target</div>
            <div className="text-sm">{result.gazeTarget}</div>
          </div>
        )}
        {result.environment && (
          <div className="p-2 rounded bg-surface-1 border border-border/15">
            <div className="text-xs text-muted">Environment</div>
            <div className="text-sm">{result.environment}</div>
          </div>
        )}
      </div>
    </div>
  );
}
