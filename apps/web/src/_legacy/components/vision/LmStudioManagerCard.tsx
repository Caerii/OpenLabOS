import type { LmStudioStatus } from "../../api";
import { LocalServiceStatusRow } from "./LocalServiceStatusRow";
import { VisionSectionCard } from "./VisionSectionCard";

interface Props {
  info: LmStudioStatus;
}

export function LmStudioManagerCard({ info }: Props) {
  const models = info.models;
  const modelList = info.available && models && models.length > 0 ? models : null;

  return (
    <VisionSectionCard title="LM Studio (Local GUI)">
      <LocalServiceStatusRow available={info.available}>
        {info.available
          ? `Running at ${info.url}`
          : `Not running — ${info.installHint || "start LM Studio and enable the local server"}`}
      </LocalServiceStatusRow>
      {modelList && (
        <div className="space-y-1">
          <div className="text-xs text-muted">Loaded Models:</div>
          {modelList.map((m) => (
            <div
              key={m.name}
              className="flex items-center justify-between p-1.5 rounded bg-surface-1 border border-border/15 text-sm"
            >
              <span className="font-mono">{m.name}</span>
              {m.type && <span className="text-xs text-muted">{m.type}</span>}
            </div>
          ))}
        </div>
      )}
      {info.available && (!models || models.length === 0) && (
        <p className="text-xs text-muted">No models loaded. Load a model in LM Studio's GUI to use it here.</p>
      )}
      <p className="text-xs text-subtle mt-2">
        Models are managed through LM Studio's desktop app. Load a vision model (LLaVA, Phi-3 Vision, etc.) to use it
        for frame analysis.
      </p>
    </VisionSectionCard>
  );
}
