import type { ReactNode } from "react";
import { Spinner } from "./Button";
import { Icon } from "./Icon";

export type BadgeColor = "green" | "red" | "yellow" | "blue" | "purple" | "gray";

const badgeColors: Record<BadgeColor, string> = {
  green: "labos-badge--green",
  red: "labos-badge--red",
  yellow: "labos-badge--yellow",
  blue: "labos-badge--blue",
  purple: "labos-badge--purple",
  gray: "labos-badge--gray",
};

export function Badge({ color = "gray", children, className = "" }: { color?: BadgeColor; children: ReactNode; className?: string }) {
  return (
    <span className={`labos-badge ${badgeColors[color]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusDot({ active, pulse, size = "sm" }: { active: boolean; pulse?: boolean; size?: "xs" | "sm" }) {
  const s = size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2";
  return (
    <span
      className={`inline-block ${s} rounded-full ${
        active ? "bg-good-fg" : "bg-bad-fg"
      } ${active && pulse ? "animate-pulse" : ""}`}
      aria-hidden
    />
  );
}

export function LoadingState({ className = "py-8" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-label="Loading">
      <Spinner size={24} />
    </div>
  );
}

export function ConnectionRequiredState({
  message = "Connect to glasses first",
  className = "h-64",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center text-muted labos-body ${className}`}>
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 text-subtle opacity-80">{icon}</div>}
      <h4 className="labos-title mb-1">{title}</h4>
      {description && <p className="labos-body max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type AlertVariant = "error" | "success" | "info";

const alertStyles: Record<AlertVariant, string> = {
  error: "labos-alert--error",
  success: "labos-alert--success",
  info: "labos-alert--info",
};

export function AlertBanner({ variant = "error", icon, children, onDismiss }: {
  variant?: AlertVariant;
  icon?: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`labos-alert animate-fade-in ${alertStyles[variant]}`} role="alert">
      {icon}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="labos-focus shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          <Icon d="M6 18 18 6M6 6l12 12" size={14} />
        </button>
      )}
    </div>
  );
}
