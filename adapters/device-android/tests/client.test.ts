/**
 * DeviceClient unit tests using a mocked fetch — no real device required.
 * These pin the request paths and bodies so an unmodified Mentra Live
 * accepts them without surprise.
 */
import { describe, expect, it, vi } from "vitest";
import { DeviceClient } from "../src/client.js";

interface Recorded {
  url: string;
  method: string;
  body: string | null;
}

function recordingFetch(responses: Record<string, unknown>): {
  fetch: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const f: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, method, body });
    const path = new URL(url).pathname;
    const key = `${method} ${path}`;
    const value = responses[key] ?? responses[path];
    if (value === undefined) {
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: f, calls };
}

describe("DeviceClient", () => {
  it("hits /api/status with no body", async () => {
    const { fetch, calls } = recordingFetch({
      "GET /api/status": { battery: { percent: 92 } },
    });
    const c = new DeviceClient({ baseUrl: "http://1.2.3.4:8080", fetch });
    const status = await c.status();
    expect(status.battery?.percent).toBe(92);
    expect(calls[0]?.url).toBe("http://1.2.3.4:8080/api/status");
    expect(calls[0]?.method).toBe("GET");
  });

  it("posts settings as JSON", async () => {
    const { fetch, calls } = recordingFetch({
      "PUT /api/settings": { ok: true },
    });
    const c = new DeviceClient({ baseUrl: "http://1.2.3.4:8080", fetch });
    await c.putSettings({ brightness: 0.7 });
    expect(calls[0]).toMatchObject({
      url: "http://1.2.3.4:8080/api/settings",
      method: "PUT",
      body: JSON.stringify({ brightness: 0.7 }),
    });
  });

  it("attaches the x-labos-token header when present", async () => {
    const captured: Record<string, string>[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured.push(init?.headers as Record<string, string>);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };
    const c = new DeviceClient({
      baseUrl: "http://1.2.3.4:8080",
      token: "abc123",
      fetch: fetchImpl,
    });
    await c.health();
    expect(captured[0]?.["x-labos-token"]).toBe("abc123");
  });

  it("constructs the preview URL using the configured base", () => {
    const c = new DeviceClient({ baseUrl: "http://1.2.3.4:8080", fetch: vi.fn() });
    expect(c.previewStreamUrl()).toBe("http://1.2.3.4:8080/api/preview/stream");
    expect(c.previewFrameUrl()).toBe("http://1.2.3.4:8080/api/preview/frame");
    expect(c.eventsStreamUrl()).toBe("http://1.2.3.4:8080/api/events");
  });

  it("raises with the device's response body on non-200", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("device offline", { status: 503, statusText: "Unavailable" });
    const c = new DeviceClient({ baseUrl: "http://1.2.3.4:8080", fetch: fetchImpl });
    await expect(c.status()).rejects.toThrow(/503.*device offline/);
  });
});
