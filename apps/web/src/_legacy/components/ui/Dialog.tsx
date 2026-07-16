import { type ReactNode } from "react";
import { Btn } from "./Button";
import { Modal } from "./Modal";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className={`labos-dialog w-full ${widthClass}`}>
        <div className="labos-dialog-head">
          <div className="labos-title">{title}</div>
          {description && <div className="labos-body mt-1">{description}</div>}
        </div>
        {children}
        {footer && <div className="labos-dialog-foot">{footer}</div>}
      </div>
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Btn variant="secondary" size="sm" onClick={onClose}>
            {cancelText}
          </Btn>
          <Btn variant={destructive ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmText}
          </Btn>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
