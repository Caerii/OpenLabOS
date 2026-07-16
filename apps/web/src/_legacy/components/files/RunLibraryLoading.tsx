export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-border/20 ${className}`} />;
}

export function EvidenceLoadingSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-label="Loading step evidence">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        Loading step evidence
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="mt-2 h-3 w-72 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-36" />
            </div>
            <SkeletonBlock className="h-6 w-16" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div className="overflow-hidden rounded-lg border border-border/15 bg-surface-2">
              <SkeletonBlock className="aspect-video rounded-none" />
              <div className="p-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-2 h-3 w-40" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RunLibraryLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-4 w-20" />
      </div>
      <SkeletonBlock className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="rounded-xl border border-border/15 bg-surface-2 p-3">
              <SkeletonBlock className="h-4 w-44" />
              <SkeletonBlock className="mt-2 h-3 w-28" />
              <SkeletonBlock className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border/15 bg-surface-2 p-4">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-6 w-64 max-w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-20" />)}
          </div>
          <EvidenceLoadingSkeleton />
        </div>
      </div>
    </div>
  );
}
