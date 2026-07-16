import { Badge, Btn, Card, Icon } from "../../ui/index";
import type { KitchenRunAdherenceResult, KitchenStepStatus, LabOSFeatureFlags } from "../../../api";
import { deriveLabOSExperience } from "../../../lib/labosExperience";
import { ICON } from "../icons";
import { AdherenceResult } from "./AdherenceResult";
import { VerificationResult } from "./VerificationResult";

export function StepCard({
  step,
  verifying,
  confirmingStep,
  adherenceChecking,
  autoAdherence,
  lastAdherence,
  featureFlags,
  onConfirmStep,
  onUndoStep,
  canUndoStep,
  onVerify,
  onAdherenceTick,
  onAutoAdherenceChange,
  onSkip,
  onRequestCompleteOverride,
}: {
  step: KitchenStepStatus;
  verifying: boolean;
  confirmingStep: boolean;
  adherenceChecking: boolean;
  autoAdherence: boolean;
  lastAdherence: KitchenRunAdherenceResult | null;
  featureFlags: LabOSFeatureFlags | null;
  onConfirmStep: () => void;
  onUndoStep: () => void;
  canUndoStep: boolean;
  onVerify: () => void;
  onAdherenceTick: () => void;
  onAutoAdherenceChange: (value: boolean) => void;
  onSkip: () => void;
  /** Opens confirm - does not advance until user confirms (bypasses ER verify gating). */
  onRequestCompleteOverride: () => void;
}) {
  const experience = deriveLabOSExperience(featureFlags);
  const showExpertControls = experience.capabilities.advancedEvidence;

  return (
    <Card className="!border-l-2 !border-l-emerald-500/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-10 h-10 rounded-xl bg-highlight-bg/10 border border-highlight-border/20 flex items-center justify-center shrink-0">
          <span className="text-good-fg font-bold text-sm">{step.number}</span>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-[13px] text-fg font-medium leading-relaxed">{step.instruction}</p>

          {step.requiredObjects?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {step.requiredObjects.map((obj: string) => <Badge key={obj} color="blue">{obj}</Badge>)}
            </div>
          )}

          {(step.hazardChecks?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {step.hazardChecks!.map((h: string, i: number) => (
                <Badge key={i} color="yellow"><Icon d={ICON.alert} size={10} />{h}</Badge>
              ))}
            </div>
          )}

          {step.spatialHint && <p className="text-[11px] text-muted italic">{step.spatialHint}</p>}
          {showExpertControls && step.lastVerification && <VerificationResult v={step.lastVerification} />}
          {showExpertControls && <AdherenceResult result={lastAdherence} />}

          <div className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:flex-wrap sm:items-center">
            <Btn className="w-full sm:w-auto" variant="primary" size="md" onClick={onConfirmStep} loading={confirmingStep}>
              Confirm Step
            </Btn>
            <Btn className="w-full sm:w-auto" variant="secondary" size="md" onClick={onUndoStep} disabled={!canUndoStep}>
              Redo Previous Step
            </Btn>
            {showExpertControls && (
              <details className="w-full rounded-lg border border-border/15 bg-border/10 px-3 py-2 sm:w-auto">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Advanced checks
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Btn className="w-full sm:w-auto" variant="secondary" size="sm" onClick={onAdherenceTick} loading={adherenceChecking}>Auto Check</Btn>
                  <label className="flex items-center justify-center gap-1.5 text-[11px] text-muted select-none rounded-lg border border-border/15 px-2 py-1.5 sm:justify-start">
                    <input
                      type="checkbox"
                      checked={autoAdherence}
                      onChange={(event) => onAutoAdherenceChange(event.target.checked)}
                    />
                    Auto pilot
                  </label>
                  <Btn className="w-full sm:w-auto" variant="secondary" size="sm" onClick={onVerify} loading={verifying}>Verify Step</Btn>
                  <Btn className="w-full sm:w-auto" variant="secondary" size="sm" onClick={onSkip}>Skip</Btn>
                  <Btn className="w-full sm:w-auto" variant="ghost" size="sm" onClick={onRequestCompleteOverride} title="Bypasses verification">
                    Override...
                  </Btn>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
