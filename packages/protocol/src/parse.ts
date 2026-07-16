/**
 * JSON parsing helpers that wrap our Zod schemas with friendly error
 * formatting. Split into a *throwing* path (for code that wants exceptions)
 * and a *safe* path (for code that wants a discriminated result).
 *
 * The shape of the safe-parse result deliberately mirrors `z.SafeParseReturnType`
 * but flattens the error to a `ZodError` so callers don't have to reach
 * through one extra layer.
 */
import { ZodError, type ZodIssue, type ZodTypeAny, z } from "zod";
import { JudgmentSchema, type Judgment } from "./judgment.js";
import { ProtocolSchema, type Protocol } from "./protocol.js";
import { RunManifestSchema, type RunManifest } from "./run.js";

export type ParseSuccess<T> = { success: true; data: T };
export type ParseFailure = { success: false; error: ZodError };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function jsonSyntaxError(message: string): ZodError {
  const issue: ZodIssue = { code: "custom", message, path: [] };
  return new ZodError([issue]);
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("\n");
}

function parse<T>(schema: ZodTypeAny, json: string, label: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `Invalid JSON for ${label}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new Error(`${label} validation failed:\n${formatZodError(r.error)}`);
  }
  return r.data as T;
}

function safeParse<T>(
  schema: ZodTypeAny,
  json: string,
  label: string,
): ParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: jsonSyntaxError(`Invalid JSON for ${label}: ${msg}`) };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { success: true, data: r.data as T };
  return { success: false, error: r.error };
}

export const parseProtocolJson = (json: string): Protocol =>
  parse<Protocol>(ProtocolSchema, json, "protocol");
export const safeParseProtocolJson = (json: string): ParseResult<Protocol> =>
  safeParse<Protocol>(ProtocolSchema, json, "protocol");

export const parseJudgmentJson = (json: string): Judgment =>
  parse<Judgment>(JudgmentSchema, json, "judgment");
export const safeParseJudgmentJson = (json: string): ParseResult<Judgment> =>
  safeParse<Judgment>(JudgmentSchema, json, "judgment");

export const parseRunManifestJson = (json: string): RunManifest =>
  parse<RunManifest>(RunManifestSchema, json, "run manifest");
export const safeParseRunManifestJson = (json: string): ParseResult<RunManifest> =>
  safeParse<RunManifest>(RunManifestSchema, json, "run manifest");

// re-export ZodError so callers can pattern-match without depending on zod directly.
export { ZodError } from "zod";
// silence unused-z warning for tooling that strips imports aggressively
void z;
