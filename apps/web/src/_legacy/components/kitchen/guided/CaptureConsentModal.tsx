import { Btn } from "../../ui";
import { Dialog } from "../../ui/Dialog";

export const CAPTURE_CONSENT_STORAGE_KEY = "labos.captureConsent.accepted";

export function hasCaptureConsent(): boolean {
  try {
    return window.localStorage.getItem(CAPTURE_CONSENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function recordCaptureConsent(): void {
  try {
    window.localStorage.setItem(CAPTURE_CONSENT_STORAGE_KEY, "true");
  } catch {}
}

export function CaptureConsentModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Camera capture notice"
      description="Starting a guided run begins recording from the connected camera or glasses. Frames and short clips stay with the run for review."
      widthClass="max-w-lg"
      footer={
        <>
          <Btn variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            onClick={() => {
              recordCaptureConsent();
              onConfirm();
            }}
          >
            Start Recording
          </Btn>
        </>
      }
    >
      <div className="labos-dialog-body space-y-2 text-sm text-muted">
        <p>
          OpenLabOS saves step snapshots, short video clips, and a session log for review and export.
        </p>
        <p>
          Only start a run when everyone in view has consented to capture. Delete saved runs from the Runs library when retention is no longer needed.
        </p>
      </div>
    </Dialog>
  );
}
