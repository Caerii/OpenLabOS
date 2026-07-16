import { AlertBanner, Badge, Card, CardHeader, CardTitle, Icon, Spinner } from "../../ui";
import { ICON } from "../icons";
import {
  ActionBar,
  BatchPreview,
  ResultsPanel,
  RunSettings,
  SegmentPicker,
  SourcePicker,
  usePreloadedClipSandbox,
} from "./sandbox";

export function PreloadedClipSandboxCard() {
  const sandbox = usePreloadedClipSandbox();

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Icon d={ICON.grid} size={16} className="text-accentText" />}
          sub={sandbox.demoMode === "static"
            ? "Keyless static replay clips bundled with the live site"
            : "Preloaded tutorial clips from the extracted tea dataset"}
        >
          Compositional Clip Sandbox
        </CardTitle>
        <Badge color={sandbox.sourceGroups.length ? "green" : "yellow"}>{sandbox.sourceGroups.length || 0} sources</Badge>
        {sandbox.samples.length > 0 && <Badge color="gray">{sandbox.samples.length} clips</Badge>}
        {sandbox.selectedSegments.length > 0 && <Badge color="blue">{sandbox.selectedSegments.length} selected</Badge>}
        {sandbox.samples.length > 0 && <Badge color={sandbox.demoMode === "static" ? "blue" : "green"}>{sandbox.demoMode}</Badge>}
      </CardHeader>

      {sandbox.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner size={14} />
          Loading preloaded tutorial clips...
        </div>
      ) : sandbox.error && !sandbox.samples.length ? (
        <AlertBanner variant="info" icon={<Icon d={ICON.alert} size={14} />}>{sandbox.error}</AlertBanner>
      ) : sandbox.selected && sandbox.selectedSource ? (
        <div className="space-y-4">
          {sandbox.error && (
            <AlertBanner icon={<Icon d={ICON.alert} size={14} />} onDismiss={() => sandbox.setError("")}>
              {sandbox.error}
            </AlertBanner>
          )}

          <AlertBanner variant="info" icon={<Icon d={ICON.alert} size={14} />}>
            These public YouTube tutorials are proxy source videos for exercising the analysis primitives. The hands-free demo dataset still needs first-person glasses recordings so the model sees the user&apos;s actual egocentric view.
          </AlertBanner>

          <SourcePicker
            sourceGroups={sandbox.sourceGroups}
            selectedSource={sandbox.selectedSource}
            fps={sandbox.fps}
            onChooseSource={sandbox.chooseSource}
          />

          <SegmentPicker
            selectedSource={sandbox.selectedSource}
            selected={sandbox.selected}
            selectedIds={sandbox.selectedIds}
            selectedCount={sandbox.selectedSegments.length}
            fps={sandbox.fps}
            onChooseSegment={sandbox.chooseSegment}
            onSelectAll={sandbox.selectAllSegments}
            onSelectPrimaryOnly={sandbox.selectPrimaryOnly}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
            <BatchPreview
              selected={sandbox.selected}
              selectedSegments={sandbox.selectedSegments}
              selectedPreviewUrl={sandbox.selectedPreviewUrl || ""}
              demoMode={sandbox.demoMode}
              fps={sandbox.fps}
              onFocusSegment={sandbox.focusSegment}
            />

            <RunSettings
              selectedSegments={sandbox.selectedSegments}
              fps={sandbox.fps}
              stepNumber={sandbox.stepNumber}
              demoMode={sandbox.demoMode}
              onFpsChange={sandbox.setFps}
              onStepNumberChange={sandbox.setStepNumber}
            />
          </div>

          <ActionBar
            running={sandbox.running}
            demoMode={sandbox.demoMode}
            selectedCount={sandbox.selectedSegments.length}
            onRunClipSummary={sandbox.runClipSummary}
            onRunTeacherJudgment={sandbox.runTeacherJudgment}
            onRunMultiscaleValidation={sandbox.runMultiscaleValidation}
            onRunPrimitiveSuite={sandbox.runPrimitiveSuite}
          />

          <ResultsPanel
            clipResult={sandbox.clipResult}
            teacherResult={sandbox.teacherResult}
            multiscaleResult={sandbox.multiscaleResult}
            suiteResults={sandbox.suiteResults}
          />
        </div>
      ) : null}
    </Card>
  );
}
