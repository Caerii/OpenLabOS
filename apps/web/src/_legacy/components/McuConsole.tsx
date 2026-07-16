import { useState, useRef, useEffect } from "react";
import { consoleSend, consoleClear } from "../api";

interface Props {
  connected: boolean;
}

interface LogEntry {
  type: "tx" | "rx" | "error";
  text: string;
}

const QUICK_COMMANDS: { label: string; json: string }[] = [
  { label: "Version", json: '{"C":"cs_syvr","V":1,"B":""}' },
  { label: "Battery", json: '{"C":"mh_batv","V":1,"B":""}' },
  { label: "Touch Events", json: '{"C":"cs_swit","V":1,"B":"{\\"type\\":26,\\"switch\\":true}"}' },
  { label: "LED On", json: '{"C":"cs_ledon","V":1,"B":"{\\"led\\":4,\\"ontime\\":1000,\\"offtime\\":0,\\"count\\":1}"}' },
];

export default function McuConsole({ connected }: Props) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  function startStream() {
    if (esRef.current) return;
    const es = new EventSource("/api/console/stream");
    esRef.current = es;
    setStreaming(true);

    es.onmessage = (event) => {
      const text = event.data;
      if (text) {
        setLines((prev) => {
          const entry: LogEntry = { type: "rx", text };
          const next = [...prev, entry];
          return next.length > 2000 ? next.slice(-1500) : next;
        });
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setStreaming(false);
    };
  }

  function stopStream() {
    esRef.current?.close();
    esRef.current = null;
    setStreaming(false);
  }

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || busy) return;
    await sendCommand(command.trim());
    setCmdHistory((h) => [command.trim(), ...h.slice(0, 50)]);
    setHistIdx(-1);
    setCommand("");
  }

  async function sendCommand(cmd: string) {
    setLines((h) => [...h, { type: "tx", text: `> ${cmd}` }]);
    setBusy(true);
    try {
      const r = await consoleSend(cmd);
      if (r.lines?.length) {
        setLines((h) => [...h, ...r.lines.map((l) => ({ type: "rx" as const, text: l }))]);
      }
    } catch (e: any) {
      setLines((h) => [...h, { type: "error", text: e.message }]);
    }
    setBusy(false);
  }

  async function handleClear() {
    try {
      await consoleClear();
    } catch {}
    setLines([]);
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

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-accentText font-semibold">MCU Console</h2>
          <button
            className={streaming ? "btn-danger text-sm" : "btn-primary text-sm"}
            onClick={streaming ? stopStream : startStream}
          >
            {streaming ? "Stop Stream" : "Start Stream"}
          </button>
          <button className="btn-secondary text-sm" onClick={handleClear}>Clear</button>
          <div className="flex gap-2 ml-auto flex-wrap">
            {QUICK_COMMANDS.map((qc) => (
              <button
                key={qc.label}
                className="px-2 py-1 text-xs rounded bg-border/25 text-muted hover:bg-border/35"
                onClick={() => sendCommand(qc.json)}
                disabled={busy}
              >
                {qc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="card p-0">
        <div
          ref={termRef}
          className="h-[500px] overflow-y-auto p-4 font-mono text-xs space-y-0.5"
        >
          {lines.map((entry, i) => (
            <div
              key={i}
              className={
                entry.type === "tx"
                  ? "text-labos-green"
                  : entry.type === "error"
                  ? "text-red-400"
                  : "text-info-fg"
              }
            >
              <pre className="whitespace-pre-wrap break-all">{entry.text}</pre>
            </div>
          ))}
          {busy && <div className="text-muted">Sending...</div>}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border/20 flex">
          <span className="text-labos-green px-3 py-2 text-sm font-mono">MCU&gt;</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-fg font-mono text-sm py-2 focus:outline-none"
            placeholder="Enter MCU command (JSON)..."
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
