import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-ink text-receipt hover:bg-tomato disabled:bg-ink-faint disabled:text-receipt",
  secondary:
    "border border-ink text-ink hover:bg-ink hover:text-receipt disabled:border-ink-faint disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint",
  ghost:
    "text-ink-soft hover:bg-receipt hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent",
};

/** Base action control. 44px minimum height for touch; colour transitions only. */
export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-colors duration-150 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
