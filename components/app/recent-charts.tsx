"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChart } from "lucide-react";
import { tickerHref } from "@/lib/routes";
import { readRecentCharts, RECENT_CHARTS_EVENT } from "@/lib/charts/recent";
import { cn } from "@/lib/utils";

/**
 * The header's way back to a chart: the last few symbols opened, one tap each,
 * on every screen size (owner, 2026-10-28). Renders nothing until a chart has
 * been opened in this browser.
 */
export function RecentCharts() {
  const pathname = usePathname();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => setSymbols(readRecentCharts());
    // Scheduled, as the bell's first fetch is: no state set inside the commit that mounted it.
    const kickoff = setTimeout(load, 0);
    window.addEventListener(RECENT_CHARTS_EVENT, load);
    // Another tab's change arrives as a storage event.
    window.addEventListener("storage", load);
    return () => {
      clearTimeout(kickoff);
      window.removeEventListener(RECENT_CHARTS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (symbols.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Recent charts"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent",
          open && "bg-accent-soft text-accent",
        )}
      >
        <LineChart className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-3 py-2 text-sm font-medium">Recent charts</div>
          {symbols.map((symbol) => {
            const href = tickerHref(symbol);
            const current = pathname === href;
            return (
              <Link
                key={symbol}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-between border-b border-border px-3 text-sm font-medium last:border-b-0 hover:bg-background",
                  current && "text-accent",
                )}
              >
                {symbol}
                {current && <span className="text-xs font-normal text-muted">Open now</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
