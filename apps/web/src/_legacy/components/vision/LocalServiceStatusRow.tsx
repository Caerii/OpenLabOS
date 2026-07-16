import type { ReactNode } from "react";

interface Props {
  available: boolean;
  children: ReactNode;
}

export function LocalServiceStatusRow({ available, children }: Props) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-2 h-2 rounded-full ${available ? "bg-green-400" : "bg-red-400"}`} />
      <span className="text-sm">{children}</span>
    </div>
  );
}
