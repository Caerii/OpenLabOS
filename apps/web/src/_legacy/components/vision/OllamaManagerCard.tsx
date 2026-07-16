import type { OllamaStatus } from "../../api";
import { LocalServiceStatusRow } from "./LocalServiceStatusRow";
import { VisionSectionCard } from "./VisionSectionCard";

type OllamaModelRow = NonNullable<OllamaStatus["models"]>[number];

interface Props {
  info: OllamaStatus;
  pullModel: string;
  onPullModelChange: (value: string) => void;
  pulling: boolean;
  pullStatus: string;
  onPull: () => void;
}

export function OllamaManagerCard({
  info,
  pullModel,
  onPullModelChange,
  pulling,
  pullStatus,
  onPull,
}: Props) {
  return (
    <VisionSectionCard title="Ollama (Local Inference)">
      <LocalServiceStatusRow available={info.available}>
        {info.available
          ? `Running v${info.version} at ${info.url}`
          : `Not running — ${info.installHint || "start with: ollama serve"}`}
      </LocalServiceStatusRow>
      {info.available && info.models && (
        <div className="space-y-1 mb-3">
          <div className="text-xs text-muted">Installed Models:</div>
          {info.models.map((m: OllamaModelRow) => (
            <div
              key={m.name}
              className="flex items-center justify-between p-1.5 rounded bg-surface-1 border border-border/15 text-sm"
            >
              <span className="font-mono">{m.name}</span>
              <span className="text-xs text-muted">
                {(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 bg-surface-2 border border-border/20 rounded text-sm text-fg"
          value={pullModel}
          onChange={(e) => onPullModelChange(e.target.value)}
          placeholder="llava:7b"
        />
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={onPull}
          disabled={pulling || !info.available}
        >
          {pulling ? "Pulling..." : "Pull"}
        </button>
      </div>
      {pullStatus && <p className="text-xs text-muted mt-2">{pullStatus}</p>}
      {info.gpuNote && <p className="text-xs text-subtle mt-2">{info.gpuNote}</p>}
    </VisionSectionCard>
  );
}
