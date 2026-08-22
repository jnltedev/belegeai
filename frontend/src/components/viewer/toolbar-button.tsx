import type { ButtonHTMLAttributes } from "react";

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function ToolbarButton({ label, className = "", children, ...props }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}
