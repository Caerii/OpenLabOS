import type { Context } from "hono";
import type { ZodError } from "zod";

export function formatZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    code: issue.code,
    message: issue.message,
    fix_hint: fixHintFor(issue.path.join("."), issue.code),
  }));
}

function fixHintFor(path: string, code: string): string {
  if (path === "protocol_version" && code === "invalid_string") {
    return "Use semver, e.g. 1.0.0";
  }
  if (path.endsWith("session_id")) return "Provide a valid UUID v4 session_id.";
  if (path.endsWith("step_id")) return "Use the protocol step_id, not a display title.";
  return "Check the request body against the OpenAPI schema for this route.";
}

export function validationFailure(c: Context, error: ZodError, status: 400 | 422 = 400) {
  return c.json({ error: "validation_failed", issues: formatZodIssues(error) }, status);
}
