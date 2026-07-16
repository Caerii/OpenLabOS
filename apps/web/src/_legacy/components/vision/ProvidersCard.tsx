import { Surface } from "../ui";
import type { AIProviderStatus } from "../../api";
import { VisionSectionCard } from "./VisionSectionCard";

export function ProvidersCard({ providers }: { providers: AIProviderStatus[] }) {
  return (
    <VisionSectionCard title="AI Providers">
      <div className="space-y-2">
        {providers.map((p) => (
          <Surface key={p.name} className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  p.available ? "bg-green-400" : p.configured ? "bg-yellow-400" : "bg-red-400"
                }`}
              />
              <span className="font-medium capitalize">{p.name}</span>
            </div>
            <div className="text-xs text-muted">
              {p.available
                ? `${p.models.length} model${p.models.length !== 1 ? "s" : ""}`
                : p.error
                  ? p.error.slice(0, 40)
                  : "Not configured"}
            </div>
          </Surface>
        ))}
      </div>
    </VisionSectionCard>
  );
}

