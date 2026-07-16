import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  children: ReactNode;
  /** Extra classes on the outer `card` wrapper (e.g. `lg:col-span-2`). */
  className?: string;
}

export function VisionSectionCard({ title, className, children }: Props) {
  const outer = className?.trim() ? `card ${className}` : "card";
  return (
    <div className={outer}>
      <h3 className="text-accentText font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
