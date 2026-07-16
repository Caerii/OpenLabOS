export function VisionHeader({
  running,
}: {
  running: boolean;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-accentText font-semibold text-lg">AI Vision Pipeline</h2>
          <p className="text-muted text-sm mt-1">
            Egocentric frame analysis for scene understanding, hand tracking, and data collection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-highlight-bg/10 text-accentText text-xs border border-highlight-border/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Pipeline Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

