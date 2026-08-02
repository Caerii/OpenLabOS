import type { Context, Next } from "hono";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(opts?: { limit?: number; windowMs?: number }) {
  const limit = opts?.limit ?? Number(process.env.OPENLABOS_RATE_LIMIT ?? 120);
  const windowMs = opts?.windowMs ?? 60_000;
  return async (c: Context, next: Next) => {
    const key = c.req.header("x-forwarded-for") ?? "local";
    const now = Date.now();
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  };
}
