import { Badge, Btn } from "../../ui/index";
import type { KitchenStepStatus } from "../../../api";
import type { OperatorAction, OperatorSecondaryAction } from "./types";

/** Slim mobile action dock — context + one primary action. */
export function OperatorActionDock({
  stageLabel,
  primaryAction,
  secondaryActions,
  currentStep,
  recordingActive,
  showSecondary = false,
}: {
  stageLabel: string;
  primaryAction: OperatorAction;
  secondaryActions: OperatorSecondaryAction[];
  currentStep: KitchenStepStatus | null;
  recordingActive: boolean;
  showSecondary?: boolean;
}) {
  const kicker = currentStep ? `Step ${currentStep.number}` : stageLabel;

  return (
    <div className="oc-action-dock lg:hidden" role="toolbar" aria-label="Operator actions">
      <div className="oc-action-dock-inner">
        <div className="oc-action-dock-context">
          <div className="flex items-center gap-2">
            <span className="oc-action-dock-kicker">{kicker}</span>
            {recordingActive ? <Badge color="red">REC</Badge> : null}
          </div>
          {primaryAction.detail ? (
            <p className="oc-action-dock-detail line-clamp-2">{primaryAction.detail}</p>
          ) : null}
        </div>
        <div className="oc-action-dock-actions">
          {showSecondary &&
            secondaryActions.slice(0, 2).map((action) => (
              <Btn
                key={action.key}
                variant={action.variant}
                size="sm"
                disabled={action.disabled || !action.onClick}
                loading={action.loading}
                onClick={action.onClick}
              >
                {action.key === "redo-previous-step" ? "Redo" : action.label}
              </Btn>
            ))}
          <Btn
            variant="primary"
            size="md"
            className="oc-action-primary"
            disabled={primaryAction.disabled || !primaryAction.onClick}
            loading={primaryAction.loading}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Btn>
        </div>
      </div>
    </div>
  );
}
