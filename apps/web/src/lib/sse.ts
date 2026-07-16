/**
 * Tiny EventSource hook for the on-device SSE stream.
 *
 * The on-device dashboard server emits a single SSE channel at
 * /api/events. Each event payload is a JSON envelope of the form
 * { kind, ...fields }. Consumers register typed handlers per kind.
 *
 * The hook owns reconnection. EventSource handles automatic retry with
 * a server-suggested interval, but if the connection rejects (e.g. the
 * device just rebooted), we back off and retry.
 */
import { useEffect, useRef, useState } from "react";

export type DeviceEvent =
  | { kind: "battery"; percent: number; voltage: number; at: number }
  | { kind: "mcu"; connected: boolean; at: number }
  | { kind: "wifi"; connected: boolean; ssid?: string; ip?: string; at: number }
  | { kind: "preview"; fps: number; frameCount: number; at: number }
  | { kind: "audio"; running: boolean; at: number }
  | { kind: string; at?: number; [k: string]: unknown };

export type ConnectionState = "connecting" | "open" | "closed" | "error";

interface UseDeviceEventsOptions {
  url?: string;
  onEvent?: (event: DeviceEvent) => void;
  enabled?: boolean;
}

export function useDeviceEvents({
  url = "/api/device/api/events",
  onEvent,
  enabled = true,
}: UseDeviceEventsOptions = {}) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [last, setLast] = useState<DeviceEvent | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let closed = false;
    let attempt = 0;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      if (closed) return;
      setState("connecting");
      es = new EventSource(url, { withCredentials: false });
      es.onopen = () => {
        attempt = 0;
        setState("open");
      };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as DeviceEvent;
          setLast(data);
          eventRef.current?.(data);
        } catch {
          /* malformed event — drop it */
        }
      };
      es.onerror = () => {
        setState("error");
        es?.close();
        if (closed) return;
        attempt++;
        const delay = Math.min(8000, 500 * 2 ** attempt);
        retryTimer = setTimeout(open, delay);
      };
    };

    open();
    return () => {
      closed = true;
      setState("closed");
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [url, enabled]);

  return { state, last };
}
