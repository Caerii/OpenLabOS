import fs from "node:fs/promises";
import path from "node:path";

export interface PreviewLabReportSummary {
  runId: string;
  label: string;
  path: string;
  ticks?: number;
  durationSec?: number;
  pipeline?: {
    glassToGlassMs?: { p50?: number | null; p95?: number | null };
    streamFrameAgeMs?: { p50?: number | null; p95?: number | null };
    fps?: { avg?: number | null };
  };
  powerMw?: {
    instantaneous?: { p50?: number | null; p95?: number | null };
  };
}

function artifactsRoot(): string {
  return path.resolve(process.cwd(), "artifacts", "preview-energy");
}

export async function listPreviewLabReports(limit = 12): Promise<PreviewLabReportSummary[]> {
  const root = artifactsRoot();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const runs = entries
    .filter((name) => name.startsWith("run-"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const reports: PreviewLabReportSummary[] = [];
  for (const runId of runs) {
    const runDir = path.join(root, runId);
    let files: string[] = [];
    try {
      files = await fs.readdir(runDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".summary.json")) continue;
      const label = file.replace(/\.summary\.json$/, "");
      const fullPath = path.join(runDir, file);
      try {
        const raw = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        reports.push({
          runId,
          label,
          path: path.relative(process.cwd(), fullPath).replace(/\\/g, "/"),
          ticks: typeof parsed.ticks === "number" ? parsed.ticks : undefined,
          durationSec: typeof parsed.durationSec === "number" ? parsed.durationSec : undefined,
          pipeline: parsed.pipeline as PreviewLabReportSummary["pipeline"],
          powerMw: parsed.powerMw as PreviewLabReportSummary["powerMw"],
        });
      } catch {
        reports.push({ runId, label, path: path.relative(process.cwd(), fullPath).replace(/\\/g, "/") });
      }
    }
  }

  return reports.sort((a, b) => `${b.runId}/${b.label}`.localeCompare(`${a.runId}/${a.label}`));
}
