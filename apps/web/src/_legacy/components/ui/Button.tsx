import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ControlSize = "xs" | "sm" | "md";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantCls: Record<ButtonVariant, string> = {
  primary: "labos-btn--primary",
  secondary: "labos-btn--secondary",
  danger: "labos-btn--danger",
  ghost: "labos-btn--ghost",
};

const sizeCls: Record<ControlSize, string> = {
  xs: "labos-btn--xs",
  sm: "labos-btn--sm",
  md: "labos-btn--md",
};

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Btn({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: BtnProps) {
  return (
    <button
      type={type}
      className={`labos-btn labos-focus ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === "xs" ? 12 : 14} /> : icon}
      {children}
    </button>
  );
}
