import { type ReactNode, useEffect } from "react";

export function Modal({
  open,
  onClose,
  children,
  className = "",
  overlayClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`labos-overlay ${overlayClassName}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`max-h-full max-w-full animate-fade-in ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
