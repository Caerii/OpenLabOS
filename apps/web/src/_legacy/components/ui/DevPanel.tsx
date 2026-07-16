/**
 * DevPanel — Developer tools overlay for LabOS.
 *
 * Shows API request log, raw JSON viewer, and auto-generated SDK/CLI snippets.
 * Slides in from the right side of the viewport.
 */

import { useState, useEffect, useRef } from "react";
import { Badge, Btn, Icon } from "./index";
import { type ApiLogEntry, subscribeApiLog, getApiLog, clearApiLog, toCurl, toSdkSnippet, toCliCommand } from "../../lib/apiLog";
import { snippetViewIcons } from "../../lib/snippetViewIcons";

const ICONS = {
  ...snippetViewIcons,
  code: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
  trash:
    "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0",
  x: "M6 18 18 6M6 6l12 12",
};

const DEV_SNIPPET_TABS = ["curl", "sdk", "cli"] as const;
type SnippetTab = (typeof DEV_SNIPPET_TABS)[number];

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-blue-400",
  POST:   "text-accentText",
  PUT:    "text-amber-400",
  DELETE: "text-red-400",
  PATCH:  "text-purple-400",
};

function StatusBadge({ status }: { status?: number }) {
  if (!status) return <Badge color="gray">pending</Badge>;
  if (status < 300) return <Badge color="green">{status}</Badge>;
  if (status < 400) return <Badge color="yellow">{status}</Badge>;
  return <Badge color="red">{status}</Badge>;
}

function JsonViewer({ data, label }: { data: any; label: string }) {
  const [collapsed, setCollapsed] = useState(true);
  if (data === undefined || data === null) return null;

  const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const lines = json.split("\n");
  const isLong = lines.length > 6;

  return (
    <div>
      <button
        className="flex items-center gap-1 text-[10px] font-medium text-muted hover:text-fg mb-1"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon d={collapsed ? ICONS.chevRight : ICONS.chevDown} size={10} />
        {label} {isLong && <span className="text-subtle">({lines.length} lines)</span>}
      </button>
      {!collapsed && (
        <pre className="text-[11px] font-mono text-muted bg-border/10 rounded-lg p-3 overflow-x-auto max-h-60 overflow-y-auto border border-border/15 leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  );
}

function SnippetView({ entry }: { entry: ApiLogEntry }) {
  const [tab, setTab] = useState<SnippetTab>("curl");
  const [copied, setCopied] = useState(false);

  const snippets: Record<SnippetTab, string> = {
    curl: toCurl(entry),
    sdk:  toSdkSnippet(entry),
    cli:  toCliCommand(entry),
  };

  function handleCopy() {
    navigator.clipboard.writeText(snippets[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 mb-1">
        {DEV_SNIPPET_TABS.map((t) => (
          <button
            key={t}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              tab === t ? "bg-highlight-bg/12 text-highlight" : "text-subtle hover:text-muted"
            }`}
            onClick={() => setTab(t)}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <button
          className="ml-auto text-subtle hover:text-fg transition-colors"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          <Icon d={ICONS.clipboard} size={12} />
        </button>
        {copied && <span className="text-[10px] text-accentText">Copied!</span>}
      </div>
      <pre className="text-[11px] font-mono text-accentText bg-border/10 rounded-lg p-3 overflow-x-auto border border-border/15 leading-relaxed whitespace-pre-wrap">
        {snippets[tab]}
      </pre>
    </div>
  );
}

function RequestEntry({ entry }: { entry: ApiLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const age = Date.now() - entry.timestamp;
  const timeStr = age < 60000
    ? `${Math.round(age / 1000)}s ago`
    : `${Math.round(age / 60000)}m ago`;

  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-border/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon d={expanded ? ICONS.chevDown : ICONS.chevRight} size={10} className="text-subtle shrink-0" />
        <span className={`font-mono text-[11px] font-bold w-12 shrink-0 ${METHOD_COLORS[entry.method] || "text-gray-400"}`}>
          {entry.method}
        </span>
        <span className="text-[11px] text-muted font-mono truncate flex-1 min-w-0">{entry.url}</span>
        <StatusBadge status={entry.status} />
        {entry.durationMs !== undefined && (
          <span className={`text-[10px] font-mono tabular-nums shrink-0 ${
            entry.durationMs < 200 ? "text-muted" : entry.durationMs < 1000 ? "text-amber-500" : "text-red-400"
          }`}>
            {entry.durationMs}ms
          </span>
        )}
        <span className="text-[10px] text-subtle shrink-0 w-14 text-right">{timeStr}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          {entry.error && (
            <div className="text-[11px] text-red-400 bg-red-500/8 rounded-lg px-3 py-2 border border-red-500/15">
              {entry.error}
            </div>
          )}
          <JsonViewer data={entry.requestBody} label="Request Body" />
          <JsonViewer data={entry.responseBody} label="Response Body" />
          <SnippetView entry={entry} />
        </div>
      )}
    </div>
  );
}

export default function DevPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<ApiLogEntry[]>(getApiLog());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeApiLog(() => setEntries([...getApiLog()]));
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[540px] max-w-[90vw] z-50 bg-surface-1 border-l border-border/20 shadow-2xl shadow-black/50 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-highlight-bg/10 border border-highlight-border/20 flex items-center justify-center">
              <Icon d={ICONS.terminal} size={14} className="text-accentText" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Dev Tools</h2>
              <p className="text-[10px] text-muted">{entries.length} requests logged</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Btn variant="ghost" size="xs" onClick={() => clearApiLog()}>
              <Icon d={ICONS.trash} size={12} />
              Clear
            </Btn>
            <button
              className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-border/10 transition-colors"
              onClick={onClose}
            >
              <Icon d={ICONS.x} size={16} />
            </button>
          </div>
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Icon d={ICONS.code} size={32} className="text-subtle mb-3" />
              <p className="text-sm text-muted font-medium">No API requests yet</p>
              <p className="text-xs text-subtle mt-1">Interact with the dashboard to see requests appear here.</p>
            </div>
          ) : (
            entries.map((entry) => <RequestEntry key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/20 shrink-0">
          <p className="text-[10px] text-subtle font-mono">
            labos-sdk @ localhost:3847 &middot; {entries.filter(e => e.error).length} errors &middot; avg {
              entries.length > 0
                ? Math.round(entries.reduce((s, e) => s + (e.durationMs || 0), 0) / entries.length)
                : 0
            }ms
          </p>
        </div>
      </div>
    </>
  );
}
