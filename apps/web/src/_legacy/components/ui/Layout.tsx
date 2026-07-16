import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="labos-eyebrow">{children}</div>;
}

export function SegmentedControl<T extends string>({ options, value, onChange, className = "" }: {
  options: { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`labos-segmented overflow-x-auto ${className}`} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className="labos-segmented-item labos-focus flex shrink-0 items-center gap-1.5"
          data-active={value === opt.id ? "true" : "false"}
          onClick={() => onChange(opt.id)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TabBar<T extends string>({
  options,
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <nav className={`labos-tabs ${className}`} aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className="labos-tab labos-focus"
          data-active={value === opt.id ? "true" : "false"}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </nav>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: "green" | "default" }) {
  return (
    <div className="labos-surface px-3 py-2.5">
      <div className="labos-eyebrow mb-1 !text-[9px]">{label}</div>
      <div className={`text-lg font-semibold font-mono tabular-nums tracking-tight ${color === "green" ? "text-accentText" : "text-fg"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-subtle">{sub}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  className = "",
  barClassName = "",
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={`h-1 rounded-full bg-border/15 overflow-hidden ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${
          barClassName || "bg-accent"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Surface({ children, className = "", variant = "subtle" }: {
  children: ReactNode;
  className?: string;
  variant?: "subtle" | "solid";
}) {
  return (
    <div
      className={`rounded-[var(--labos-radius-md)] border ${
        variant === "solid"
          ? "labos-surface"
          : "bg-border/5 border-border/10"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function KpiTile({ label, value, tone = "default" }: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const valueCls =
    tone === "good" ? "text-accentText"
    : tone === "warn" ? "text-warn-fg"
    : tone === "bad" ? "text-bad-fg"
    : tone === "info" ? "text-info-fg"
    : "text-fg";

  return (
    <Surface variant="solid" className="p-2 text-center">
      <div className={`text-lg font-mono font-semibold tabular-nums ${valueCls}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </Surface>
  );
}

export function PanelHeader({ title, subtitle, right }: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="labos-eyebrow">{title}</div>
        {subtitle && <div className="labos-title">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
