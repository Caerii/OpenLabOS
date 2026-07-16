import { AlertBanner, Badge, Card, Icon, NumberedStep, SectionLabel, Stat } from "../../ui";
import { DeveloperPreviewCard } from "./DeveloperPreviewCard";
import { ICON } from "../icons";
import { DifficultyBadge } from "../DifficultyBadge";

export function ExtractedProtocolView({ result }: { result: any }) {
  const proto = result?.protocol;
  if (!proto) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {result.saved && (
        <AlertBanner variant="success" icon={<Icon d={ICON.check} size={14} />}>
          Protocol saved and ready to use!
        </AlertBanner>
      )}

      {!proto.parseError ? (
        <>
          <Card>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-fg">{proto.name}</h3>
                <p className="text-xs text-muted mt-0.5">{proto.description}</p>
              </div>
              <DifficultyBadge difficulty={proto.difficulty} />
            </div>

            {proto.requiredInventory?.length > 0 && (
              <div className="mb-4">
                <SectionLabel>Required Items</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {proto.requiredInventory.map((item: any, i: number) => (
                    <Badge
                      key={i}
                      color={item.category === "ingredient" ? "green" : item.category === "appliance" ? "purple" : "blue"}
                    >
                      {item.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <SectionLabel>Steps ({proto.steps?.length})</SectionLabel>
            <div className="space-y-2">
              {proto.steps?.map((step: any, i: number) => (
                <NumberedStep key={i} number={step.number || i + 1}>
                  <p className="text-xs text-muted leading-relaxed">{step.instruction}</p>
                  {step.hazardChecks?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {step.hazardChecks.map((h: string, j: number) => (
                        <span key={j} className="text-[10px] text-amber-400 flex items-center gap-0.5">
                          <Icon d={ICON.alert} size={9} />
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </NumberedStep>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Stat label="Latency" value={`${result.latencyMs}ms`} />
              <span className="text-[10px] text-subtle truncate">Source: {result.videoUrl}</span>
            </div>
          </Card>

          <DeveloperPreviewCard result={result} />
        </>
      ) : (
        <Card>
          <SectionLabel>Raw ER Response</SectionLabel>
          <pre className="text-xs text-muted whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">{result.raw}</pre>
        </Card>
      )}
    </div>
  );
}

