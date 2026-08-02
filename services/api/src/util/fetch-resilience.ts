const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_RETRIES = 2;

export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

export async function fetchWithResilience(
  url: string,
  opts: ResilientFetchOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function probeJson<T>(
  url: string,
  validate: (body: unknown) => body is T,
): Promise<{ ok: true; body: T } | { ok: false; detail: string }> {
  try {
    const res = await fetchWithResilience(url, { retries: 1, timeoutMs: 2_000 });
    const body = await res.json();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    if (!validate(body)) return { ok: false, detail: "unexpected response shape" };
    return { ok: true, body };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
