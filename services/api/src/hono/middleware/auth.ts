import type { Context, Next } from "hono";

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const required = process.env.OPENLABOS_AUTH_REQUIRED === "true";
    if (!required) {
      await next();
      return;
    }
    const expected = process.env.OPENLABOS_API_TOKEN?.trim();
    if (!expected) {
      return c.json({ error: "auth_misconfigured" }, 503);
    }
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : c.req.header("x-openlabos-token");
    if (token !== expected) return c.json({ error: "unauthorized" }, 401);
    await next();
  };
}
