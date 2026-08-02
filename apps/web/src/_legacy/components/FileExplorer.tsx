import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { usePolling } from "../hooks/usePolling";
import {
  fetchFileStats,
  fetchPhotos,
  fetchVideos,
  fetchFileList,
  deleteFile,
  type FileStats,
  type MediaFile,
  type LabOSFeatureExperience,
  type LabOSFeatureFlags,
} from "../api";
import { ConfirmDialog, ConnectionRequiredState, LoadingState, SegmentedControl } from "./ui";
import { deriveLabOSExperience } from "../lib/labosExperience";
import { RunLibrary } from "./files/RunLibrary";

interface Props {
  connected: boolean;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience: LabOSFeatureExperience | null;
}

const FILE_EXPLORER_SUB_TABS = [
  { id: "runs" as const, label: "Runs" },
  { id: "photos" as const, label: "Photos" },
  { id: "videos" as const, label: "Videos" },
  { id: "browse" as const, label: "Browse" },
] as const;

type SubTab = (typeof FILE_EXPLORER_SUB_TABS)[number]["id"];
type MediaSort = "newest" | "oldest" | "largest" | "name" | "linked";

const MEDIA_SORT_OPTIONS = [
  { id: "newest" as const, label: "Newest" },
  { id: "oldest" as const, label: "Oldest" },
  { id: "largest" as const, label: "Largest" },
  { id: "name" as const, label: "Name" },
  { id: "linked" as const, label: "Linked Runs" },
];

function subTabFromQuery(value: string | null, tabs: ReadonlyArray<(typeof FILE_EXPLORER_SUB_TABS)[number]>): SubTab | null {
  return tabs.some((tab) => tab.id === value) ? value as SubTab : null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function mediaSearchText(file: MediaFile) {
  return [
    file.name,
    file.path,
    ...file.evidenceLinks.flatMap((link) => [
      link.runId,
      link.protocolName || "",
      link.stepInstruction || "",
      link.runStatus || "",
      link.attemptId || "",
      link.attemptStatus || "",
      ...link.adherenceActions,
    ]),
  ].join(" ").toLowerCase();
}

function filterAndSortMedia<T extends MediaFile>(files: T[], query: string, sort: MediaSort, linkedOnly: boolean): T[] {
  const q = query.trim().toLowerCase();
  return [...files]
    .filter((file) => (!linkedOnly || file.linkedRunCount > 0) && (!q || mediaSearchText(file).includes(q)))
    .sort((a, b) => {
      if (sort === "largest") return b.size - a.size;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "linked") return (b.linkedRunCount - a.linkedRunCount) || (b.deviationCount - a.deviationCount) || Date.parse(b.date) - Date.parse(a.date);
      if (sort === "oldest") return Date.parse(a.date) - Date.parse(b.date);
      return Date.parse(b.date) - Date.parse(a.date);
    });
}

function EvidenceBadges({ file }: { file: MediaFile }) {
  if (!file.evidenceLinks.length) return null;
  const first = file.evidenceLinks[0];
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className="rounded border border-highlight-border/20 bg-highlight-bg/10 px-1.5 py-0.5 text-[10px] font-medium text-accentText">
        {file.linkedRunCount} run{file.linkedRunCount === 1 ? "" : "s"}
      </span>
      {first.stepNumber && (
        <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
          step {first.stepNumber}
        </span>
      )}
      {first.attemptNumber && first.attemptNumber > 1 && (
        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
          attempt {first.attemptNumber}
        </span>
      )}
      {first.attemptStatus === "superseded" && (
        <span className="rounded border border-border/20 bg-border/10 px-1.5 py-0.5 text-[10px] font-medium text-subtle">
          redone
        </span>
      )}
      {file.deviationCount > 0 && (
        <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
          deviation
        </span>
      )}
    </div>
  );
}

function EvidenceSummary({ file }: { file: MediaFile }) {
  const first = file.evidenceLinks[0];
  if (!first) return null;
  return (
    <p className="mt-1 truncate text-xs text-subtle">
      {first.protocolName || first.protocolId || "Protocol run"}
      {first.stepNumber ? ` - step ${first.stepNumber}` : ""}
      {first.attemptNumber && first.attemptNumber > 1 ? ` - attempt ${first.attemptNumber}` : ""}
    </p>
  );
}

function MediaToolbar({
  query,
  sort,
  linkedOnly,
  total,
  shown,
  onQuery,
  onSort,
  onLinkedOnly,
}: {
  query: string;
  sort: MediaSort;
  linkedOnly: boolean;
  total: number;
  shown: number;
  onQuery: (value: string) => void;
  onSort: (value: MediaSort) => void;
  onLinkedOnly: (value: boolean) => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 py-1.5 text-sm sm:max-w-xs"
          placeholder="Search file, run, protocol, step..."
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <select
          className="input w-32 py-1.5 text-sm"
          value={sort}
          onChange={(event) => onSort(event.target.value as MediaSort)}
        >
          {MEDIA_SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-border/20 bg-border/10 px-2.5 py-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-emerald-500"
            checked={linkedOnly}
            onChange={(event) => onLinkedOnly(event.target.checked)}
          />
          linked only
        </label>
      </div>
      <div className="text-xs text-subtle">{shown} of {total}</div>
    </div>
  );
}

function FileIcon({ isDirectory }: { isDirectory: boolean }) {
  if (isDirectory) {
    return (
      <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-subtle flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

function StatsBar({ stats }: { stats: FileStats }) {
  return (
    <div className="card">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold font-mono text-accentText">{stats.totalPhotos}</p>
          <p className="text-xs text-muted">Photos</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono text-accentText">{stats.totalVideos}</p>
          <p className="text-xs text-muted">Videos</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono text-fg">{formatMB(stats.usedMB)}</p>
          <p className="text-xs text-muted">Used</p>
        </div>
        <div>
          <p className="text-2xl font-bold font-mono text-fg">{formatMB(stats.freeMB)}</p>
          <p className="text-xs text-muted">Free</p>
        </div>
      </div>
    </div>
  );
}

function PhotoGrid({ connected, query, sort, linkedOnly, onQuery, onSort, onLinkedOnly }: {
  connected: boolean;
  query: string;
  sort: MediaSort;
  linkedOnly: boolean;
  onQuery: (value: string) => void;
  onSort: (value: MediaSort) => void;
  onLinkedOnly: (value: boolean) => void;
}) {
  const { data, loading } = usePolling(fetchPhotos, 30000, connected);
  const photos = data?.photos || [];
  const shown = filterAndSortMedia(photos, query, sort, linkedOnly);

  if (loading && !data) return <LoadingState />;

  return (
    <>
      <MediaToolbar query={query} sort={sort} linkedOnly={linkedOnly} total={photos.length} shown={shown.length} onQuery={onQuery} onSort={onSort} onLinkedOnly={onLinkedOnly} />
      {!photos.length ? (
        <p className="text-muted text-sm text-center py-8">No photos found</p>
      ) : !shown.length ? (
        <p className="text-muted text-sm text-center py-8">No matching photos</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {shown.map((photo) => (
            <a
              key={photo.path}
              href={`/api/files/download?path=${encodeURIComponent(photo.path)}`}
              download={photo.name}
              className="group bg-surface-2 rounded-lg overflow-hidden border border-border/20 hover:border-highlight-border/40 transition-colors"
            >
              {photo.thumbnailUrl ? (
                <div className="aspect-square bg-surface-1">
                  <img src={photo.thumbnailUrl} alt={photo.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="aspect-square bg-surface-1 flex items-center justify-center">
                  <svg className="w-10 h-10 text-subtle" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              <div className="p-2">
                <p className="text-xs font-mono truncate text-muted group-hover:text-accentText transition-colors">{photo.name}</p>
                <p className="text-xs text-subtle">{formatSize(photo.size)}</p>
                <EvidenceSummary file={photo} />
                <EvidenceBadges file={photo} />
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function VideoList({ connected, query, sort, linkedOnly, onQuery, onSort, onLinkedOnly }: {
  connected: boolean;
  query: string;
  sort: MediaSort;
  linkedOnly: boolean;
  onQuery: (value: string) => void;
  onSort: (value: MediaSort) => void;
  onLinkedOnly: (value: boolean) => void;
}) {
  const { data, loading } = usePolling(fetchVideos, 30000, connected);
  const videos = data?.videos || [];
  const shown = filterAndSortMedia(videos, query, sort, linkedOnly);

  if (loading && !data) return <LoadingState />;

  return (
    <>
      <MediaToolbar query={query} sort={sort} linkedOnly={linkedOnly} total={videos.length} shown={shown.length} onQuery={onQuery} onSort={onSort} onLinkedOnly={onLinkedOnly} />
      {!videos.length ? (
        <p className="text-muted text-sm text-center py-8">No videos found</p>
      ) : !shown.length ? (
        <p className="text-muted text-sm text-center py-8">No matching videos</p>
      ) : (
        <div className="space-y-1">
          {shown.map((video) => (
            <a
              key={video.path}
              href={`/api/files/download?path=${encodeURIComponent(video.path)}`}
              download={video.name}
              className="flex items-center gap-3 py-2.5 px-3 rounded hover:bg-border/10 group transition-colors"
            >
              <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-border/20 bg-surface-1">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg className="w-8 h-8 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate text-muted group-hover:text-accentText transition-colors">{video.name}</p>
                <p className="text-xs text-subtle">
                  {formatDate(video.date)}
                  {video.duration && ` - ${video.duration}`}
                </p>
                <EvidenceSummary file={video} />
                <EvidenceBadges file={video} />
              </div>
              <span className="text-xs text-subtle flex-shrink-0">{formatSize(video.size)}</span>
              <span className="text-xs text-accentText opacity-0 group-hover:opacity-100 transition-opacity">Download</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function FileBrowser({ connected }: { connected: boolean }) {
  const [currentPath, setCurrentPath] = useState("/sdcard/LabOS/");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  const fetcher = useCallback(() => fetchFileList(currentPath), [currentPath]);
  const { data, loading, refresh } = usePolling(fetcher, 30000, connected);

  const breadcrumbs = currentPath.split("/").filter(Boolean);
  const sortedEntries = data?.entries
    ? [...data.entries].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  function navigateTo(path: string) {
    const normalized = path.endsWith("/") ? path : path + "/";
    setCurrentPath(normalized);
  }

  function navigateBreadcrumb(index: number) {
    const path = "/" + breadcrumbs.slice(0, index + 1).join("/") + "/";
    setCurrentPath(path);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setMsg("");
    try {
      await deleteFile(deleteTarget);
      setMsg(`Deleted: ${deleteTarget}`);
      refresh();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          className="text-accentText hover:underline"
          onClick={() => setCurrentPath("/")}
        >
          /
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-subtle">/</span>
            <button
              className="text-accentText hover:underline"
              onClick={() => navigateBreadcrumb(i)}
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {msg && <p className="text-xs text-muted bg-border/10 border border-border/15 p-2 rounded">{msg}</p>}

      {/* File list */}
      {loading && !data ? (
        <LoadingState />
      ) : data && sortedEntries.length > 0 ? (
        <div className="space-y-0.5">
          {/* Go up */}
          {currentPath !== "/" && (
            <button
              className="flex items-center gap-3 w-full py-2 px-3 rounded hover:bg-border/10 text-left transition-colors"
              onClick={() => {
                const parts = currentPath.replace(/\/$/, "").split("/");
                parts.pop();
                navigateTo(parts.join("/") || "/");
              }}
            >
              <span className="text-yellow-400 text-lg">..</span>
              <span className="text-sm text-muted">Parent directory</span>
            </button>
          )}
          {sortedEntries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center gap-3 py-2 px-3 rounded hover:bg-border/10 group transition-colors"
            >
              {entry.isDirectory ? (
                <button
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  onClick={() => navigateTo(entry.path)}
                >
                  <FileIcon isDirectory={true} />
                  <span className="text-sm font-mono truncate text-muted group-hover:text-accentText transition-colors">
                    {entry.name}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon isDirectory={false} />
                  <span className="text-sm font-mono truncate text-muted">{entry.name}</span>
                </div>
              )}
              <span className="text-xs text-subtle flex-shrink-0">
                {entry.isDirectory ? "" : formatSize(entry.size)}
              </span>
              <span className="text-xs text-subtle flex-shrink-0 w-28 text-right">
                {formatDate(entry.modified)}
              </span>
              {!entry.isDirectory && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <a
                    href={`/api/files/download?path=${encodeURIComponent(entry.path)}`}
                    download={entry.name}
                    className="px-2 py-1 text-xs rounded bg-highlight-bg/15 text-accentText hover:bg-highlight-bg/20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                  <button
                    className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry.path); }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted text-sm text-center py-8">Directory is empty</p>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete File"
        description="Are you sure you want to delete this file?"
        destructive
        confirmText="Delete"
        onConfirm={handleDelete}
      >
        {deleteTarget && (
          <div className="text-xs font-mono text-subtle bg-border/10 border border-border/15 p-2 rounded break-all">
            {deleteTarget}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

export default function FileExplorer({ connected, featureFlags, featureExperience }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const tabs = useMemo(
    () => FILE_EXPLORER_SUB_TABS.filter((tab) => tab.id !== "browse" || experience.mode === "engineering"),
    [experience.mode],
  );
  const [subTab, setSubTab] = useState<SubTab>("runs");
  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaSort, setMediaSort] = useState<MediaSort>("newest");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const { data: stats, loading: statsLoading } = usePolling(fetchFileStats, 30000, connected);
  const requestedTab = subTabFromQuery(searchParams.get("tab"), tabs);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === subTab)) setSubTab("runs");
  }, [subTab, tabs]);

  useEffect(() => {
    if (requestedTab && requestedTab !== subTab) setSubTab(requestedTab);
  }, [requestedTab, subTab]);

  function handleSubTabChange(nextTab: SubTab) {
    setSubTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    if (nextTab !== "runs") next.delete("runId");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {connected && (statsLoading && !stats ? <LoadingState /> : stats ? <StatsBar stats={stats} /> : null)}

      {/* Tab toggle */}
      <SegmentedControl
        options={tabs.map(({ id, label }) => ({ id, label }))}
        value={subTab}
        onChange={handleSubTabChange}
      />

      {/* Content */}
      <div className="card">
        {subTab === "runs" && <RunLibrary connected={connected} featureFlags={featureFlags} />}
        {subTab !== "runs" && !connected && (
          <ConnectionRequiredState message="Connect to glasses to browse media files" />
        )}
        {subTab === "photos" && (
          connected && (
            <PhotoGrid
              connected={connected}
              query={mediaQuery}
              sort={mediaSort}
              linkedOnly={linkedOnly}
              onQuery={setMediaQuery}
              onSort={setMediaSort}
              onLinkedOnly={setLinkedOnly}
            />
          )
        )}
        {subTab === "videos" && (
          connected && (
            <VideoList
              connected={connected}
              query={mediaQuery}
              sort={mediaSort}
              linkedOnly={linkedOnly}
              onQuery={setMediaQuery}
              onSort={setMediaSort}
              onLinkedOnly={setLinkedOnly}
            />
          )
        )}
        {subTab === "browse" && connected && <FileBrowser connected={connected} />}
      </div>
    </div>
  );
}
