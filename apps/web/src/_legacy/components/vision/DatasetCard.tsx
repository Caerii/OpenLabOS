import { KpiTile } from "../ui";
import type { DatasetStats } from "../../api";
import { VisionSectionCard } from "./VisionSectionCard";

export function DatasetCard({
  stats,
  exportCocoHref,
  exportJsonlHref,
  onClear,
}: {
  stats: DatasetStats;
  exportCocoHref: string;
  exportJsonlHref: string;
  onClear: () => void;
}) {
  return (
    <VisionSectionCard title="Dataset">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <KpiTile label="Frames" value={stats.totalFrames} />
        <KpiTile label="Annotations" value={stats.totalAnnotations} />
        <KpiTile label="MB on Disk" value={stats.diskUsageMB} />
        <KpiTile label="Models Used" value={Object.keys(stats.models).length} />
      </div>
      <div className="flex gap-2 mb-2">
        <a href={exportCocoHref} download="labos-coco.json" className="btn-primary text-xs flex-1 text-center">
          Export COCO
        </a>
        <a href={exportJsonlHref} download="labos-annotations.jsonl" className="btn-primary text-xs flex-1 text-center">
          Export JSONL
        </a>
      </div>
      <button className="btn-danger text-xs w-full" onClick={onClear}>
        Clear All
      </button>
    </VisionSectionCard>
  );
}

