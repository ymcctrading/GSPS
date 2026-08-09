"use client";

import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { cn } from "@/lib/utils";
import type { SyncState } from "./types";

/**
 * Data-freshness bar.
 * -----------------------------------------------------------------------------
 * The Portfolio's order list is broker execution data, not market data, and it
 * is only as current as the last successful reconciliation. Without a visible
 * stamp there is no difference on screen between "the broker says these two
 * orders are working" and "the broker couldn't be reached, so this is whatever
 * we last wrote down" — and the second one looks exactly as authoritative as
 * the first. That ambiguity is what let a stale Pending list pass for a live
 * one for weeks.
 *
 * Refresh does a real server round trip. A button that only re-renders what is
 * already in memory would make the staleness worse by making it feel handled.
 */
export function SyncBar({
  sync,
  refreshing,
  onRefresh,
}: {
  sync: SyncState | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const failed = Boolean(sync?.syncError) || (sync != null && sync.syncedAt == null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-1 pb-2">
      <div className="min-w-0 text-xs">
        <p className={cn(failed ? "text-warn" : "text-muted")}>
          {refreshing
            ? "Checking with the broker…"
            : failed
              ? "Not synced — showing the last saved list"
              : `Last synced ${formatOpenedAt(sync?.syncedAt ?? null)}`}
        </p>
        {sync?.syncError && <p className="mt-0.5 text-warn">{sync.syncError}</p>}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={cn(
          "min-h-9 shrink-0 cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors",
          refreshing
            ? "cursor-not-allowed text-muted/60"
            : "text-muted hover:border-accent hover:text-accent",
        )}
      >
        {refreshing ? "Refreshing…" : "Refresh orders"}
      </button>
    </div>
  );
}
