"use client";

import { cn } from "@/lib/utils";

/** The same on/off switch the automation panel uses. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors", checked ? "bg-bull" : "bg-border")}
    >
      <span
        className={cn(
          "absolute top-1 h-6 w-6 rounded-full bg-white transition-transform",
          checked ? "translate-x-7" : "translate-x-1",
        )}
      />
    </button>
  );
}
