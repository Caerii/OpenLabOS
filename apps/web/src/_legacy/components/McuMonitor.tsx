import { useState, useRef, useEffect } from "react";
import { usePolling } from "../hooks/usePolling";
import { ListRow, PanelHeader } from "./ui";
import {
  fetchMcuStatus,
  fetchMcuEvents,
  type McuStatus,
  type McuEvents,
} from "../api";

interface Props {
  connected: boolean;
}

interface LogLine {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
}

function eventTypeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("button")) return "text-blue-400";
  if (t.includes("battery")) return "text-yellow-400";
  if (t.includes("gesture")) return "text-purple-400";
  if (t.includes("error")) return "text-red-400";
  return "text-muted";
}

function eventTypeBadge(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("button")) return "bg-blue-500/20 text-blue-400";
  if (t.includes("battery")) return "bg-yellow-500/20 text-yellow-400";
  if (t.includes("gesture")) return "bg-purple-500/20 text-purple-400";
  if (t.includes("error")) return "bg-red-500/20 text-red-400";
  return "bg-border/30 text-muted";
}

function logLevelColor(level: string): string {
  switch (level.toUpperCase()) {
    case "D": return "text-muted";
    case "I": return "text-blue-400";
    case "W": return "text-yellow-400";
    case "E": return "text-red-400";
    case "F": return "text-red-500 font-bold";
    default: return "text-muted";
  }
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-labos-green/30 border-t-labos-green rounded-full animate-spin" />
    </div>
  );
}

export default function McuMonitor({ connected }: Props) {
  const { data: status, loading: statusLoading, refresh: refreshStatus } = usePolling(fetchMcuStatus, 3000, connected);
  const { data: events, loading: eventsLoading, refresh: refreshEvents } = usePolling(fetchMcuEvents, 3000, connected);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  function toggleStream() {
    if (streaming) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setStreaming(false);
      return;
    }

    const es = new EventSource("/api/mcu/stream");
    eventSourceRef.current = es;
    setStreaming(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          const parsed = parseLogLine(data.line);
          setLogLines((prev) => {
            const next = [...prev, parsed];
            return next.length > 2000 ? next.slice(-1500) : next;
          });
        }
      } catch {}
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }

  function parseLogLine(line: string): LogLine {
    // Try to parse Android logcat format: "MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: message"
    const match = line.match(/^(\S+\s+\S+)\s+\d+\s+\d+\s+([DIWEF])\s+(\S+?)\s*:\s*(.*)$/);
    if (match) {
      return { timestamp: match[1], level: match[2], tag: match[3], message: match[4] };
    }
    return { timestamp: "", level: "I", tag: "", message: line };
  }

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function handleRefreshAll() {
    refreshStatus();
    refreshEvents();
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        Connect to glasses to view MCU status
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top row: status + UART */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection Status */}
        <div className="card">
          <PanelHeader
            title="MCU Connection"
            right={<button className="btn-secondary text-xs" onClick={handleRefreshAll}>Refresh</button>}
          />
          {statusLoading && !status ? (
            <Spinner />
          ) : status ? (
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-colors ${
                  status.connected
                    ? "border-labos-green bg-labos-green/10"
                    : "border-red-500 bg-red-500/10"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full ${
                    status.connected ? "bg-labos-green animate-pulse" : "bg-red-500"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <p className={`text-lg font-semibold ${status.connected ? "text-labos-green" : "text-red-400"}`}>
                  {status.connected ? "Connected" : "Disconnected"}
                </p>
                <p className="text-xs text-muted">
                  Last seen: {status.lastSeen ? new Date(status.lastSeen).toLocaleString() : "Never"}
                </p>
                {status.firmwareVersion && (
                  <p className="text-xs text-muted">Firmware: {status.firmwareVersion}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* UART Activity */}
        <div className="card">
          <PanelHeader title="UART Activity" />
          {statusLoading && !status ? (
            <Spinner />
          ) : status ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted text-sm">Frame Count</span>
                <p className="text-2xl font-bold font-mono text-fg">{status.uartFrameCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted text-sm">Bytes Received</span>
                <p className="text-2xl font-bold font-mono text-fg">
                  {status.bytesReceived >= 1024 * 1024
                    ? `${(status.bytesReceived / (1024 * 1024)).toFixed(1)} MB`
                    : status.bytesReceived >= 1024
                    ? `${(status.bytesReceived / 1024).toFixed(1)} KB`
                    : `${status.bytesReceived} B`}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <PanelHeader title="Recent Events" />
        {eventsLoading && !events ? (
          <Spinner />
        ) : events?.events?.length ? (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {events.events.map((evt, i) => (
              <ListRow
                key={i}
                className="px-2 py-1.5"
                left={
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted font-mono flex-shrink-0 w-36">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`badge text-xs flex-shrink-0 ${eventTypeBadge(evt.type)}`}>
                      {evt.type}
                    </span>
                    <span className={`text-sm truncate ${eventTypeColor(evt.type)}`}>{evt.data}</span>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">No events recorded</p>
        )}
      </div>

      {/* Live Log Stream */}
      <div className="card p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
          <h3 className="text-accentText font-semibold">Live LabOS Log Stream</h3>
          <div className="flex items-center gap-2">
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-labos-green">
                <span className="w-2 h-2 rounded-full bg-labos-green animate-pulse" />
                Streaming
              </span>
            )}
            <button
              className={streaming ? "btn-danger text-xs" : "btn-primary text-xs"}
              onClick={toggleStream}
            >
              {streaming ? "Stop" : "Start"} Stream
            </button>
            {logLines.length > 0 && (
              <button
                className="btn-secondary text-xs"
                onClick={() => setLogLines([])}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div
          ref={logRef}
          className="h-[400px] overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5"
        >
          {logLines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted">
              {streaming ? "Waiting for log data..." : "Click Start Stream to begin"}
            </div>
          ) : (
            logLines.map((line, i) => (
              <div key={i} className={`${logLevelColor(line.level)} whitespace-pre-wrap break-all`}>
                {line.timestamp && (
                  <span className="text-subtle">{line.timestamp} </span>
                )}
                {line.level && (
                  <span className={logLevelColor(line.level)}>{line.level} </span>
                )}
                {line.tag && (
                  <span className="text-muted">{line.tag}: </span>
                )}
                <span>{line.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
