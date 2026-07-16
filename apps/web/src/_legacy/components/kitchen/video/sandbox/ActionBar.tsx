import { Btn } from "../../../ui";
import { PRIMITIVE_SUITE_CALLS } from "./model";
import type { DemoMode } from "./types";

export function ActionBar({
  running,
  demoMode,
  selectedCount,
  onRunClipSummary,
  onRunTeacherJudgment,
  onRunMultiscaleValidation,
  onRunPrimitiveSuite,
}: {
  running: string;
  demoMode: DemoMode;
  selectedCount: number;
  onRunClipSummary: () => void;
  onRunTeacherJudgment: () => void;
  onRunMultiscaleValidation: () => void;
  onRunPrimitiveSuite: () => void;
}) {
  const disabled = !!running || demoMode === "static";
  return (
    <div className="flex flex-wrap gap-2">
      <Btn size="sm" variant="primary" loading={running === "clip"} disabled={disabled} onClick={onRunClipSummary}>
        Analyze Selected ({selectedCount})
      </Btn>
      <Btn size="sm" loading={running === "teacher"} disabled={disabled} onClick={onRunTeacherJudgment}>
        Teacher Judge ({selectedCount})
      </Btn>
      <Btn size="sm" variant="secondary" loading={running === "multiscale"} disabled={disabled} onClick={onRunMultiscaleValidation}>
        Multiscale ({selectedCount})
      </Btn>
      <Btn size="sm" variant="secondary" loading={running === "suite"} disabled={disabled} onClick={onRunPrimitiveSuite}>
        Primitive Suite ({selectedCount} x {PRIMITIVE_SUITE_CALLS})
      </Btn>
      <span className="text-[11px] text-muted self-center">
        {demoMode === "static"
          ? "Keyless live-site mode replays bundled clips; connect a backend for live AI analysis."
          : "Multiscale runs only the frame/chunk checks that match the selected evidence; the full suite is for primitive smoke tests."}
      </span>
    </div>
  );
}
