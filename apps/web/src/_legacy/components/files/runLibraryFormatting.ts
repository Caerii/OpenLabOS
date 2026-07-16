import { runStatusBucket } from "./runLibraryModel";

export function formatDateTime(value?: string) {
  if (!value) return "Unknown time";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatSize(bytes?: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "size unavailable";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

export function statusColor(status?: string): "green" | "yellow" | "blue" | "gray" {
  const bucket = runStatusBucket(status);
  if (bucket === "completed") return "green";
  if (bucket === "running") return "blue";
  if (bucket === "partial") return "yellow";
  return "gray";
}

export function readinessColor(grade?: string): "green" | "yellow" | "blue" | "gray" {
  if (grade === "partner_ready" || grade === "analysis_ready") return "green";
  if (grade === "simple_demo_ready") return "blue";
  if (grade === "not_ready") return "yellow";
  return "gray";
}

export function formatDuration(ms?: number) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return "";
  const seconds = Math.max(1, Math.round(Number(ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
