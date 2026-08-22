import { forwardRef } from "react";
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";

export const Label = (props: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className="mb-1.5 block text-sm font-medium text-foreground" {...props} />
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${className}`}
      {...props}
    />
  );
});
