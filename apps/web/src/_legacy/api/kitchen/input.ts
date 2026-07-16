import type { ERInputOptions } from "./types";

export function inputOpts(value?: string | ERInputOptions): ERInputOptions {
  return typeof value === "string" ? { modelId: value } : value || {};
}

