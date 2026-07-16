import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePolling } from "../hooks/usePolling";
import {
  labclawStatus,
  labclawSkills,
  labclawSkillContent,
  labclawChat,
  type LabClawStatus,
  type LabclawSkillRow,
} from "../api";
import { pathForTab } from "../navPaths";
import { Card, CardHeader, CardTitle, SearchInput, Surface } from "./ui";

function isIndexed(s: LabClawStatus): s is Extract<LabClawStatus, { configured: true; ok: true }> {
  return s.configured === true && "ok" in s && s.ok === true;
}

export default function LabClawPanel({ connected: _connected }: { connected: boolean }) {
  const { data, error, refresh, loading } = usePolling(labclawStatus, 20000);
  const [copied, setCopied] = useState(false);

  const [skillQuery, setSkillQuery] = useState("");
  const skillQueryRef = useRef(skillQuery);
  skillQueryRef.current = skillQuery;
  const [skills, setSkills] = useState<LabclawSkillRow[] | null>(null);
  const [skillsMeta, setSkillsMeta] = useState<{ total: number; returned: number } | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [skillBody, setSkillBody] = useState<string | null>(null);
  const [skillTrunc, setSkillTrunc] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [chatModel, setChatModel] = useState("google:gemini-2.5-flash");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const installLine =
    data && "openclawInstallLine" in data ? data.openclawInstallLine : "install https://github.com/wu-yc/LabClaw";

  const loadSkills = useCallback(async () => {
    if (!data || !isIndexed(data)) return;
    setSkillsLoading(true);
    try {
      const q = skillQueryRef.current.trim() || undefined;
      const r = await labclawSkills({ q, limit: 400, refresh: false, sort: "fit" });
      setSkills(r.skills);
      setSkillsMeta({ total: r.total, returned: r.returned });
    } catch {
      setSkills([]);
      setSkillsMeta(null);
    } finally {
      setSkillsLoading(false);
    }
  }, [data]);

  useEffect(() => {
    if (!data || !isIndexed(data)) return;
    void loadSkills();
  }, [data, loadSkills]);

  useEffect(() => {
    if (!selectedRef || !data || !isIndexed(data)) {
      setSkillBody(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    labclawSkillContent(selectedRef)
      .then((r) => {
        if (!cancelled) {
          setSkillBody(r.content);
          setSkillTrunc(r.truncated);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkillBody(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRef, data]);

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(installLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatError(null);
    setChatLoading(true);
    const nextHist = [...chatHistory, { role: "user" as const, content: msg }];
    setChatHistory(nextHist);
    setChatInput("");
    try {
      const out = await labclawChat({
        message: msg,
        skillRef: selectedRef || undefined,
        history: chatHistory,
        modelId: chatModel.trim() || undefined,
      });
      setChatHistory((h) => [...h, { role: "assistant", content: out.text }]);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Chat failed";
      setChatError(m);
      setChatHistory((h) => h.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl">
      <Surface className="p-5">
        <h2 className="text-accentText font-semibold text-lg">LabClaw in LabOS</h2>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          <strong className="text-fg/90">LabClaw</strong> is a library of OpenClaw-style <code className="text-xs bg-border/15 px-1 rounded">SKILL.md</code> modules (
          <a href="https://github.com/wu-yc/LabClaw" target="_blank" rel="noreferrer" className="text-accentText hover:underline">
            wu-yc/LabClaw
          </a>
          ). With <code className="text-xs bg-border/15 px-1 rounded">LABCLAW_SKILLS_ROOT</code>, LabOS <strong>indexes every skill</strong>, lets you open the markdown, and runs a{" "}
          <strong className="text-fg/90">skill-grounded assistant</strong> through the same Vercel AI SDK stack as the rest of the dashboard (
          <code className="text-xs bg-border/15 px-1 rounded">labos-inference</code>). Many skills describe Python, HPC, or ToolUniverse workflows—those still need a{" "}
          <strong className="text-fg/90">compute environment</strong> (OpenClaw workspace, conda, Docker, etc.); LabOS supplies planning and copy-pasteable commands, not arbitrary code execution.
        </p>
      </Surface>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card padding="md">
          <CardHeader>
            <CardTitle sub="OpenClaw one-liner">Install skills</CardTitle>
          </CardHeader>
          <p className="text-xs text-muted mb-3">Pull the full tree into an OpenClaw workspace for tool execution.</p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 text-[11px] bg-surface-0 border border-border/20 rounded-lg px-2 py-2 break-all text-fg/90">
              {installLine}
            </code>
            <button
              type="button"
              onClick={copyInstall}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-highlight-bg/15 text-accentText text-xs font-medium border border-highlight-border/25 hover:bg-highlight-bg/25 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Card>

        <Card padding="md">
          <CardHeader>
            <CardTitle sub="LabOS">Bridge</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Link
              to={pathForTab("kitchen")}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-border/10 text-sm text-fg hover:bg-border/20 border border-border/15"
            >
              Kitchen
            </Link>
            <Link
              to={pathForTab("vision")}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-border/10 text-sm text-fg hover:bg-border/20 border border-border/15"
            >
              AI Vision
            </Link>
            <Link
              to={pathForTab("files")}
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-border/10 text-sm text-fg hover:bg-border/20 border border-border/15"
            >
              Run data
            </Link>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <CardHeader>
          <CardTitle sub="LABCLAW_SKILLS_ROOT">Status</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => refresh()}
            className="text-xs px-2.5 py-1 rounded-md border border-border/20 text-muted hover:text-fg hover:bg-border/10"
          >
            Refresh
          </button>
          {loading && <span className="text-[10px] text-subtle">Loading…</span>}
        </div>
        {error && <p className="text-sm text-red-400/90 mb-2">{error}</p>}
        {data && !data.configured && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted space-y-1">
            <p>{data.hint}</p>
            <p className="text-[10px] text-subtle">Set LABCLAW_SKILLS_ROOT in .env and restart the server.</p>
          </div>
        )}
        {data && data.configured && "ok" in data && !data.ok && <p className="text-sm text-red-400/90">{data.error}</p>}
        {data && isIndexed(data) && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-surface-0 border border-border/15 p-2">
              <dt className="text-subtle uppercase tracking-wide">skills</dt>
              <dd className="text-lg font-semibold text-fg mt-0.5">{data.skillMdCount}</dd>
            </div>
            <div className="rounded-lg bg-surface-0 border border-border/15 p-2">
              <dt className="text-subtle uppercase tracking-wide">skills/labos</dt>
              <dd className="text-lg font-semibold text-fg mt-0.5">{data.labosSkillFolderCount}</dd>
            </div>
            <div className="rounded-lg bg-surface-0 border border-border/15 p-2">
              <dt className="text-subtle uppercase tracking-wide">vision / xr</dt>
              <dd className="text-lg font-semibold text-fg mt-0.5">{data.visionOrXrSkillCount}</dd>
            </div>
            <div className="rounded-lg bg-surface-0 border border-border/15 p-2">
              <dt className="text-subtle uppercase tracking-wide">catalog cap</dt>
              <dd className="text-lg font-semibold text-fg mt-0.5">{data.truncated ? "yes" : "no"}</dd>
            </div>
          </dl>
        )}
      </Card>

      {data && isIndexed(data) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="md" className="min-h-[420px] flex flex-col">
            <CardHeader>
              <CardTitle sub={`${skillsMeta?.total ?? "—"} skills · sorted by LabOS fit`}>Catalog</CardTitle>
            </CardHeader>
            <SearchInput
              value={skillQuery}
              onChange={setSkillQuery}
              onSubmit={() => void loadSkills()}
              placeholder="Filter by path, title, domain…"
              loading={skillsLoading}
              buttonLabel="Filter"
            />
            <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-border/10 bg-surface-0 min-h-[280px] max-h-[520px]">
              {skills === null && <p className="text-xs text-subtle p-2">Loading catalog…</p>}
              {skills && skills.length === 0 && <p className="text-xs text-muted p-2">No matches.</p>}
              {skills?.map((s) => (
                <button
                  key={s.ref}
                  type="button"
                  title={s.labosFit?.reasons?.join(" · ") || undefined}
                  onClick={() => setSelectedRef(s.ref)}
                  className={`w-full text-left px-2 py-1.5 border-b border-border/10 text-[11px] hover:bg-border/10 ${
                    selectedRef === s.ref ? "bg-highlight-bg/10 text-accentText" : "text-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`text-[9px] font-bold px-1 rounded ${
                        s.labosFit?.tier === 1
                          ? "bg-highlight-bg/25 text-accentText"
                          : s.labosFit?.tier === 2
                            ? "bg-amber-500/20 text-amber-800"
                            : "bg-border/30 text-subtle"
                      }`}
                    >
                      T{s.labosFit?.tier ?? "?"}
                    </span>
                    {s.labosFit?.recommended && (
                      <span className="text-[9px] text-accentText font-medium">LabOS first</span>
                    )}
                  </div>
                  <span className="font-mono text-fg/90 block truncate">{s.ref}</span>
                  <span className="text-subtle">{s.domain}</span>
                  <span className="block text-fg/80 truncate">{s.title}</span>
                </button>
              ))}
            </div>
            {skillsMeta && (
              <p className="text-[10px] text-subtle mt-2">
                Showing {skillsMeta.returned} of {skillsMeta.total}. Append <code className="text-fg/70">?refresh=1</code> to API to bust server cache.
              </p>
            )}
          </Card>

          <Card padding="md" className="min-h-[420px] flex flex-col gap-3">
            <CardHeader>
              <CardTitle sub={selectedRef || "Select a skill"}>Preview & runner</CardTitle>
            </CardHeader>
            {!selectedRef && <p className="text-xs text-muted">Choose a skill on the left to load SKILL.md.</p>}
            {selectedRef && previewLoading && <p className="text-xs text-subtle">Loading SKILL.md…</p>}
            {selectedRef && !previewLoading && skillBody && (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="text-[10px] text-subtle font-mono truncate">{selectedRef}</div>
                {skillTrunc && (
                  <p className="text-[10px] text-amber-600/90">Preview truncated at server cap — full file on disk.</p>
                )}
                <pre className="flex-1 overflow-auto text-[10px] leading-relaxed p-2 rounded-lg bg-surface-0 border border-border/10 max-h-48 whitespace-pre-wrap">
                  {skillBody}
                </pre>
              </div>
            )}

            <div className="border-t border-border/15 pt-3 space-y-2">
              <label className="text-[10px] text-subtle uppercase tracking-wide block">Model id</label>
              <input
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="w-full text-xs font-mono bg-surface-0 border border-border/20 rounded px-2 py-1 text-fg"
                placeholder="google:gemini-2.5-flash"
              />
              <div className="max-h-32 overflow-y-auto space-y-1 text-[11px]">
                {chatHistory.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "text-fg" : "text-muted"}>
                    <span className="font-semibold text-subtle">{m.role}: </span>
                    <span className="whitespace-pre-wrap">{m.content.slice(0, 2000)}{m.content.length > 2000 ? "…" : ""}</span>
                  </div>
                ))}
              </div>
              {chatError && <p className="text-xs text-red-400/90">{chatError}</p>}
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                rows={3}
                className="w-full text-xs bg-surface-0 border border-border/20 rounded px-2 py-1.5 text-fg"
                placeholder={selectedRef ? "Ask with this skill loaded as system context…" : "Optional: select a skill for full SKILL.md grounding…"}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={chatLoading}
                  onClick={() => void sendChat()}
                  className="px-3 py-1.5 rounded-lg bg-highlight-bg/20 text-accentText text-xs font-medium border border-highlight-border/30 hover:bg-highlight-bg/30 disabled:opacity-50"
                >
                  {chatLoading ? "Running…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatHistory([]);
                    setChatError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border/20 text-xs text-muted hover:text-fg"
                >
                  Clear chat
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
