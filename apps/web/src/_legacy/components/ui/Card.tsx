import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const padMap = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-6" };

export function Card({ children, className = "", glass, padding = "md" }: CardProps) {
  return (
    <div
      className={`labos-surface rounded-[var(--labos-radius-xl)] ${
        glass ? "bg-surface-2/70 backdrop-blur-md" : ""
      } ${padMap[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, sub, icon }: { children: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--labos-radius-md)] border border-highlight-border/20 bg-highlight-bg/8">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="labos-title">{children}</h3>
        {sub && <p className="labos-body mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
