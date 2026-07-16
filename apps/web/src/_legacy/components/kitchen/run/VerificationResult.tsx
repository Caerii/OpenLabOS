import { Icon } from "../../ui/index";
import { ICON } from "../icons";

export function VerificationResult({ v }: { v: any }) {
  return (
    <div className={`p-3 rounded-lg text-xs ${
      v.success
        ? "bg-highlight-bg/8 border border-highlight-border/15 text-good-fg"
        : "bg-red-500/8 border border-red-500/15 text-red-400"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon d={v.success ? ICON.check : ICON.x} size={12} />
        <span className="font-medium">{v.success ? "Verified" : "Not yet"}</span>
        <span className="text-[10px] opacity-60">{((v.confidence || 0) * 100).toFixed(0)}% confidence</span>
      </div>
      <p className="opacity-80 leading-relaxed">{v.reasoning}</p>
    </div>
  );
}
