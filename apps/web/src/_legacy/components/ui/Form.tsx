import { forwardRef, type InputHTMLAttributes } from "react";
import { Btn, type ControlSize } from "./Button";

const inputSizeCls: Record<ControlSize, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { sizing?: ControlSize }>(
  ({ sizing = "md", className = "", ...rest }, ref) => {
    return (
      <input
        ref={ref}
        className={`labos-input labos-focus ${inputSizeCls[sizing]} ${className}`}
        {...rest}
      />
    );
  }
);

Input.displayName = "Input";

export function SearchInput({ value, onChange, onSubmit, placeholder, loading, buttonLabel = "Search", disabled }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  loading?: boolean;
  buttonLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Input
        className="flex-1"
        sizing="sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      />
      <Btn variant="primary" size="sm" onClick={onSubmit} loading={loading} disabled={disabled || !value}>
        {buttonLabel}
      </Btn>
    </div>
  );
}
