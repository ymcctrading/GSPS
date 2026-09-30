"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A titled dropdown that starts closed — the shape `LiveExpectancyToggle` set
 * for the Dashboard (project owner, 2026-09-30: the tracked and saved setups
 * "should have a drop down option, like live expectancy, instead of showing all
 * … at once"). The count sits in the label so a closed section still says how
 * much is inside it, and the body is not mounted while closed, so a list of
 * rows that each poll a live quote costs nothing until it is opened.
 *
 * `quiet` is the nested form: a text button for a group inside an open section
 * (the retired setups under a list), so two bordered bars never stack.
 */
export function CollapsibleSection({
  title,
  count,
  icon,
  defaultOpen = false,
  quiet = false,
  className,
  children,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
  defaultOpen?: boolean;
  quiet?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const label = count != null ? `${title} (${count})` : title;

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "flex cursor-pointer items-center gap-2 self-start text-sm text-muted hover:text-accent",
          !quiet && "rounded-lg border border-border bg-surface px-3 py-2 hover:border-accent",
        )}
      >
        {icon}
        {open ? `Hide ${label.charAt(0).toLowerCase()}${label.slice(1)}` : `Show ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
        {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
      </button>
      {open && <div id={bodyId}>{children}</div>}
    </div>
  );
}
