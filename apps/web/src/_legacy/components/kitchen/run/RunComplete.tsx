import { Btn, Card, Icon } from "../../ui/index";
import { ICON } from "../icons";

export function RunComplete({ totalSteps, onNewRun }: { totalSteps: number; onNewRun: () => void }) {
  return (
    <Card className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-highlight-bg/15 border border-highlight-border/25 flex items-center justify-center mx-auto mb-4">
        <Icon d={ICON.check} size={28} className="text-good-fg" />
      </div>
      <h3 className="text-base font-semibold text-good-fg mb-1">Protocol Complete!</h3>
      <p className="text-xs text-muted">All {totalSteps} steps verified.</p>
      <Btn variant="primary" className="mt-5" onClick={onNewRun}>Start New Run</Btn>
    </Card>
  );
}
