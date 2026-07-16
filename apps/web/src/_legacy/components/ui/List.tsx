import type { ReactNode } from "react";

export function SelectableCard({ selected, onClick, children, className = "" }: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`labos-selectable labos-focus group w-full ${className}`}
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MonoKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[var(--labos-radius-sm)] border border-border/12 bg-border/6 px-1.5 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function ListRow({ left, right, onClick, className = "" }: {
  left: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-[var(--labos-radius-md)] border border-transparent px-3 py-2 text-left ${
        onClick ? "labos-focus transition-colors hover:border-border/10 hover:bg-border/6" : ""
      } ${className}`}
    >
      <div className="min-w-0 flex-1">{left}</div>
      {right && <div className="shrink-0">{right}</div>}
    </Comp>
  );
}

export function TagList({ items, limit = 4 }: { items: string[]; limit?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, limit).map((t) => (
        <span key={t} className="labos-tag">{t}</span>
      ))}
      {items.length > limit && (
        <span className="labos-tag text-subtle">+{items.length - limit}</span>
      )}
    </div>
  );
}

export function NumberedStep({ number, children, className = "" }: {
  number: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-[var(--labos-radius-md)] border border-border/10 bg-border/5 p-3 ${className}`}>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--labos-radius-sm)] border border-highlight-border/20 bg-highlight-bg/8">
        <span className="text-[10px] font-semibold text-good-fg">{number}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ActionCard({ icon, title, description, loading, onClick }: {
  icon: ReactNode;
  title: string;
  description: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="labos-selectable labos-focus group w-full disabled:opacity-40"
      data-selected="false"
      onClick={onClick}
      disabled={loading}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--labos-radius-md)] border border-border/12 bg-border/6 transition-colors group-hover:border-highlight-border/20 group-hover:bg-highlight-bg/8">
          {icon}
        </div>
        <h4 className="text-[13px] font-medium text-fg">{title}</h4>
      </div>
      <p className="labos-body">{description}</p>
    </button>
  );
}
