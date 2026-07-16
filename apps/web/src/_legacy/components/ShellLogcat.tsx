import { useState, useRef, useEffect } from "react";
import { systemShell } from "../api";

interface Props {
  connected: boolean;
}

interface LogEntry {
  type: "cmd" | "output" | "error" | "logcat";
  text: string;
}

export default function ShellLogcat({ connected }: Props) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [logcatActive, setLogcatActive] = useState(false);
  const [logcatTag, setLogcatTag] = useState("LabOS");
  const termRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [history]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || busy) return;

    const cmd = command.trim();
    setCmdHistory((h) => [cmd, ...h.slice(0, 50)]);
    setHistIdx(-1);
    setCommand("");
    setHistory((h) => [...h, { type: "cmd", text: `$ ${cmd}` }]);

    setBusy(true);
    try {
      const r = await systemShell(cmd);
      setHistory((h) => [...h, { type: "output", text: r.output || "(no output)" }]);
    } catch (e: any) {
      setHistory((h) => [...h, { type: "error", text: e.message }]);
    }
    setBusy(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(next);
      if (cmdHistory[next]) setCommand(cmdHistory[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setCommand(next < 0 ? "" : cmdHistory[next] || "");
    }
  }

  function toggleLogcat() {
    if (logcatActive) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setLogcatActive(false);
      setHistory((h) => [...h, { type: "output", text: "[logcat stopped]" }]);
      return;
    }

    const url = `/api/system/logcat?tag=${encodeURIComponent(logcatTag)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;
    setLogcatActive(true);
    setHistory((h) => [...h, { type: "output", text: `[logcat started: ${logcatTag}]` }]);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          setHistory((h) => {
            const newH = [...h, { type: "logcat" as const, text: data.line }];
            return newH.length > 2000 ? newH.slice(-1500) : newH;
          });
        }
        if (data.error) {
          setHistory((h) => [...h, { type: "error", text: data.error }]);
        }
      } catch {}
    };

    es.onerror = () => {
      setLogcatActive(false);
      es.close();
    };
  }

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      {/* Logcat controls */}
      <div className="card">
        <div className="flex items-center gap-3">
          <h2 className="text-labos-green font-semibold">Logcat</h2>
          <input
            type="text"
            className="input text-sm w-32"
            placeholder="Tag filter"
            value={logcatTag}
            onChange={(e) => setLogcatTag(e.target.value)}
            disabled={logcatActive}
          />
          <button
            className={logcatActive ? "btn-danger text-sm" : "btn-primary text-sm"}
            onClick={toggleLogcat}
          >
            {logcatActive ? "Stop" : "Start"} Logcat
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="card p-0">
        <div
          ref={termRef}
          className="h-[500px] overflow-y-auto p-4 font-mono text-xs space-y-0.5"
        >
          {history.map((entry, i) => (
            <div
              key={i}
              className={
                entry.type === "cmd"
                  ? "text-labos-green"
                  : entry.type === "error"
                  ? "text-red-400"
                  : entry.type === "logcat"
                  ? "text-info-fg"
                  : "text-muted"
              }
            >
              <pre className="whitespace-pre-wrap break-all">{entry.text}</pre>
            </div>
          ))}
          {busy && <div className="text-muted">Running...</div>}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border/20 flex">
          <span className="text-labos-green px-3 py-2 text-sm font-mono">$</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-fg font-mono text-sm py-2 focus:outline-none"
            placeholder="Enter shell command..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
          />
        </form>
      </div>
    </div>
  );
}
