import { Badge, SectionLabel } from "../../../ui";
import { formatTokens } from "./model";
import { JsonPreview } from "./JsonPreview";
import type { SuiteResult } from "./types";

export function ResultsPanel({
  clipResult,
  teacherResult,
  multiscaleResult,
  suiteResults,
}: {
  clipResult: any;
  teacherResult: any;
  multiscaleResult: any;
  suiteResults: SuiteResult[];
}) {
  if (!clipResult && !teacherResult && !multiscaleResult && !suiteResults.length) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {clipResult && (
        <div>
          <SectionLabel>Clip Summary</SectionLabel>
          <JsonPreview value={clipResult.results ? clipResult : (clipResult.parsed || clipResult.raw)} />
        </div>
      )}
      {teacherResult && (
        <div>
          <SectionLabel>Teacher Judgment</SectionLabel>
          <JsonPreview value={teacherResult.results ? teacherResult : (teacherResult.judgment || teacherResult)} />
        </div>
      )}
      {multiscaleResult && (
        <div>
          <SectionLabel>Multiscale Validation</SectionLabel>
          {multiscaleResult.results ? (
            <JsonPreview value={multiscaleResult} />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge color={multiscaleResult.decision.stepComplete ? "green" : "yellow"}>
                  {multiscaleResult.decision.action}
                </Badge>
                <Badge color="gray">{Math.round(multiscaleResult.decision.confidence * 100)}% confidence</Badge>
                <Badge color="blue">{multiscaleResult.selectedChecks.length} checks</Badge>
              </div>
              <JsonPreview value={{
                decision: multiscaleResult.decision,
                evidence: multiscaleResult.evidence.map((item: any) => ({
                  checkId: item.checkId,
                  scale: item.scale,
                  modeId: item.modeId,
                  ok: item.ok,
                  passed: item.passed,
                  confidence: item.confidence,
                  warnings: item.warnings,
                  blockers: item.blockers,
                  error: item.error,
                })),
              }} />
            </>
          )}
        </div>
      )}
      {suiteResults.length > 0 && (
        <div className="xl:col-span-2">
          <SectionLabel>Primitive Suite Results</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suiteResults.map((result, index) => (
              <div key={result.id || `${result.sampleId || "result"}:${index}`} className="rounded-lg border border-border/15 bg-border/10 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-fg">{result.title || result.sampleId || "Result"}</span>
                  <div className="flex gap-1">
                    {result.tokenEstimate && <Badge color="blue">~{formatTokens(result.tokenEstimate)} tok</Badge>}
                    <Badge color={result.ok ? "green" : "red"}>
                      {result.ok ? `${result.latencyMs || 0}ms` : "failed"}
                    </Badge>
                  </div>
                </div>
                {result.time && <div className="mb-1 text-[10px] text-subtle">{result.time}</div>}
                <p className="text-[11px] text-muted truncate">
                  {result.ok
                    ? JSON.stringify(result.result?.parsed ?? result.result?.raw ?? {}).slice(0, 180)
                    : result.error}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
