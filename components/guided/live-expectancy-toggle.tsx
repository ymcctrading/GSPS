"use client";

/**
 * The Dashboard's optional view of `LiveExpectancy` — Guided shows it
 * unconditionally since that is where a recommendation is about to be acted
 * on, but the Dashboard is a denser screen a returning user reads daily, so
 * the figure starts collapsed here rather than adding a card nobody asked
 * for to every visit.
 */

import { useState } from "react";
import { LiveExpectancy } from "@/components/guided/live-expectancy";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

export function LiveExpectancyToggle() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Activity className="h-4 w-4 shrink-0" />
        {open ? "Hide live expectancy" : "Show live expectancy — is Guided currently profitable?"}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <LiveExpectancy />}
    </div>
  );
}
