import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "bull" | "bear" | "warn" | "muted";

const variants: Record<Variant, string> = {
  default: "bg-accent-soft text-accent",
  bull: "bg-bull-soft text-bull",
  bear: "bg-bear-soft text-bear",
  warn: "bg-warn-soft text-warn",
  muted: "bg-background text-muted border border-border",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
