/**
 * Generic device proxy: /api/device/<path...>
 *
 * Forwards browser requests through to the registered Android adapter's
 * on-device HTTP server, splicing in the X-LabOS-Token from server env
 * so the browser never sees credentials. Streams response bodies through
 * uninterrupted — including MJPEG previews, large file downloads, and
 * Server-Sent Events.
 *
 * The proxy is intentionally thin and stateless: no caching, no
 * transformation, no auth (other than the token forwarding). It exists
 * purely to give the web app a same-origin, credentialed channel to the
 * device.
 *
 * This is the path the legacy dashboard's "device direct" features
 * (camera preview, packages, files, audio, MCU, settings) rebuild upon
 * in apps/web.
 */
import { Hono } from "hono";

interface DeviceProxyConfig {
  baseUrl: string;
  token?: string;
}

function readConfig(): DeviceProxyConfig | null {
  const baseUrl = process.env.OPENLABOS_DEVICE_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token: process.env.OPENLABOS_DEVICE_TOKEN,
  };
}

/**
 * Hop-by-hop and request-only headers we strip before forwarding.
 * Keeping these in the request would either confuse upstream or leak
 * proxy implementation details.
 */
const STRIP_REQUEST = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "transfer-encoding",
  "keep-alive",
  "te",
  "upgrade",
  "expect",
]);

/** Headers we strip from the *response* before piping back. */
const STRIP_RESPONSE = new Set([
  "transfer-encoding",
  "content-encoding",
  "connection",
  "keep-alive",
]);

export function deviceProxyRoutes() {
  const app = new Hono();

  app.all("/*", async (c) => {
    const cfg = readConfig();
    if (!cfg) {
      return c.json(
        {
          error: "device_not_configured",
          detail:
            "OPENLABOS_DEVICE_BASE_URL is not set on the API. Boot with the device adapter env vars.",
        },
        503,
      );
    }

    const incoming = new URL(c.req.url);
    // Anything past /api/device/ is the on-device path. Preserve the query string.
    const subpath = incoming.pathname.replace(/^\/api\/device/, "") || "/";
    const upstreamUrl = `${cfg.baseUrl}${subpath}${incoming.search}`;

    const headers = new Headers();
    c.req.raw.headers.forEach((value, key) => {
      if (STRIP_REQUEST.has(key.toLowerCase())) return;
      headers.set(key, value);
    });
    if (cfg.token) headers.set("x-labos-token", cfg.token);
    // NanoHTTPD on the device gets confused by HTTP/1.1 keep-alive on
    // some flows; force a fresh socket per call (same logic as the
    // adapter client).
    headers.set("connection", "close");

    let body: BodyInit | null = null;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      body = c.req.raw.body;
    }

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method: c.req.method,
        headers,
        body,
        // @ts-expect-error — undici request-streaming flag.
        duplex: "half",
        redirect: "manual",
      });
    } catch (err) {
      return c.json(
        {
          error: "device_unreachable",
          detail: err instanceof Error ? err.message : String(err),
          upstream: upstreamUrl,
        },
        502,
      );
    }

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE.has(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });
    // Make any browser fetch from the same origin pass through cleanly.
    responseHeaders.set("access-control-allow-origin", "*");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  });

  return app;
}
