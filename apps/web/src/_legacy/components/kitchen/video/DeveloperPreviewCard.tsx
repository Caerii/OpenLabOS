import { useState } from "react";
import { Badge, Card, CardHeader, CardTitle, Icon } from "../../ui";
import { toCliCommand, toCurl, toSdkSnippet, type ApiLogEntry } from "../../../lib/apiLog";
import { snippetViewIcons } from "../../../lib/snippetViewIcons";

const SNIPPET_TABS = [
  { id: "curl" as const, label: "cURL" },
  { id: "sdk" as const, label: "SDK" },
  { id: "cli" as const, label: "CLI" },
  { id: "request" as const, label: "Request" },
  { id: "response" as const, label: "Response" },
] as const;

type SnippetTab = (typeof SNIPPET_TABS)[number]["id"];

/** Reconstructs a fake ApiLogEntry for the video-to-protocol call so we can generate snippets. */
function buildMockEntry(result: any): ApiLogEntry {
  return {
    id: 0,
    timestamp: Date.now(),
    method: "POST",
    url: "/api/kitchen/analyze/video/to-protocol",
    requestBody: {
      videoUrl: result.videoUrl,
      useSearch: false,
      thinkingLevel: "high",
    },
    status: 200,
    responseBody: {
      protocol: result.protocol,
      saved: result.saved ?? true,
      videoUrl: result.videoUrl,
      latencyMs: result.latencyMs,
    },
    durationMs: result.latencyMs,
  };
}

export function DeveloperPreviewCard({ result }: { result: any }) {
  const [tab, setTab] = useState<SnippetTab>("curl");
  const [copied, setCopied] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState<"request" | "response" | null>(null);

  const entry = buildMockEntry(result);

  const snippetContent: Record<SnippetTab, string> = {
    curl: toCurl(entry),
    sdk: toSdkSnippet(entry),
    cli: toCliCommand(entry),
    request: JSON.stringify(entry.requestBody, null, 2),
    response: JSON.stringify(entry.responseBody, null, 2),
  };

  function handleCopy() {
    navigator.clipboard.writeText(snippetContent[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Icon d={snippetViewIcons.terminal} size={16} className="text-accentText" />}
          sub="Reconstructed API call — use these snippets with the LabOS SDK or CLI"
        >
          Developer Preview
        </CardTitle>
        <Badge color="purple">SDK</Badge>
      </CardHeader>

      <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-border/10 border border-border/15">
        <span className="font-mono text-[11px] font-bold text-accentText">POST</span>
        <span className="font-mono text-[11px] text-muted flex-1 truncate">/api/kitchen/analyze/video/to-protocol</span>
        <Badge color="green">200</Badge>
        <span className="font-mono text-[10px] text-muted tabular-nums">{result.latencyMs}ms</span>
      </div>

      <div className="flex items-center gap-1 mb-2">
        {SNIPPET_TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              tab === id
                ? "bg-highlight-bg/12 text-accentText"
                : "text-subtle hover:text-muted hover:bg-border/10"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 text-subtle hover:text-fg transition-colors px-2 py-1"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          <Icon d={snippetViewIcons.clipboard} size={12} />
          <span className="text-[10px]">{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>

      <pre
        className={`text-[11px] font-mono bg-border/10 rounded-lg p-3 overflow-x-auto border border-border/15 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto ${
          tab === "response" || tab === "request" ? "text-muted" : "text-accentText"
        }`}
      >
        {snippetContent[tab]}
      </pre>

      <div className="mt-3 space-y-1">
        <button
          className="flex items-center gap-1 text-[10px] font-medium text-subtle hover:text-muted transition-colors"
          onClick={() => setJsonExpanded(jsonExpanded === "request" ? null : "request")}
        >
          <Icon d={jsonExpanded === "request" ? snippetViewIcons.chevDown : snippetViewIcons.chevRight} size={10} />
          Request Body ({JSON.stringify(entry.requestBody).length} bytes)
        </button>
        {jsonExpanded === "request" && (
          <pre className="text-[10px] font-mono text-muted bg-border/10 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto border border-border/10 animate-fade-in">
            {JSON.stringify(entry.requestBody, null, 2)}
          </pre>
        )}

        <button
          className="flex items-center gap-1 text-[10px] font-medium text-subtle hover:text-muted transition-colors"
          onClick={() => setJsonExpanded(jsonExpanded === "response" ? null : "response")}
        >
          <Icon d={jsonExpanded === "response" ? snippetViewIcons.chevDown : snippetViewIcons.chevRight} size={10} />
          Response Body ({JSON.stringify(entry.responseBody).length} bytes)
        </button>
        {jsonExpanded === "response" && (
          <pre className="text-[10px] font-mono text-muted bg-border/10 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto border border-border/10 animate-fade-in">
            {JSON.stringify(entry.responseBody, null, 2)}
          </pre>
        )}
      </div>
    </Card>
  );
}

