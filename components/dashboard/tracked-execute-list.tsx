"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert, Trash2 } from "lucide-react";
import { ScoreBadge } from "@/components/scan/score-badge";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import { cn, formatUsd } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";
import type { TrackedExecuteRow } from "@/lib/dashboard/trackedExecute";

/**
 * The Dashboard's "Your tracked Execute setups" card, laid out like
 * `SavedSetupsList` (project owner, 2026-09-28) so the two read the same way:
 * symbol, live price, side and move type on the first line; the score when the
 * setup entered Execute against the score now underneath; then the plan.
 * A row can be dismissed (POST /api/monitors/dismiss); removal is optimistic
 * and reverted if the request fails, same as `SavedSetupsList`'s delete.
 */
export function TrackedExecuteList({
  initialRows,
  exactScoreDisplayEnabled = false,
}: {
  initialRows: TrackedExecuteRow[];
  exactScoreDisplayEnabled?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);

  async function remove(symbol: string) {
    setRows((r) => r.filter((row) => row.symbol !== symbol));
    try {
      const res = await fetch("/api/monitors/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows(initialRows);
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Nothing tracked right now.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {rows.map((row) => (
        <TrackedRow
          key={row.symbol}
          row={row}
          onRemove={remove}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
        />
      ))}
    </div>
  );
}

function TrackedRow({
  row,
  onRemove,
  exactScoreDisplayEnabled,
}: {
  row: TrackedExecuteRow;
  onRemove: (symbol: string) => void;
  exactScoreDisplayEnabled: boolean;
}) {
  const quote = useLiveQuote(row.symbol, { intervalMs: 30_000 });
  const bullish = row.direction === "bullish";

  // A one-way ratchet, as in ResultsTable: "price broke the stop" is a fact
  // about what already happened, so a quote gap or a tick back over the line
  // must not un-invalidate the row.
  const [invalidated, setInvalidated] = useState(false);
  const freshlyInvalidated =
    row.stopLoss != null &&
    quote != null &&
    isInvalidatedByStop({ side: bullish ? "buy" : "sell", stop_price: row.stopLoss }, quote.price);
  if (freshlyInvalidated && !invalidated) setInvalidated(true);

  return (
    <div className={cn("flex flex-col gap-1.5 px-3 py-2.5", invalidated && "bg-bear-soft/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={tickerHref(row.symbol)} className="font-medium text-accent hover:underline">
          {row.symbol}
        </Link>
        {quote && <span className="font-mono text-sm tabular-nums">{formatUsd(quote.price)}</span>}
        <span className={bullish ? "text-xs text-bull" : "text-xs text-bear"}>{bullish ? "Buy" : "Sell"}</span>
        {row.patternName && <span className="text-xs text-muted">{row.patternName}</span>}
        {invalidated && (
          <span
            className="flex items-center gap-1 text-xs font-medium text-bear"
            title="Price has already moved through this setup's stop, so the plan no longer holds."
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            Invalidated
          </span>
        )}
      </div>

      <span className="flex items-center gap-1.5 text-xs">
        {row.executeScore != null && (
          <>
            <span title="Score when this setup entered Execute">
              <ScoreBadge
                score={row.executeScore}
                state={row.executeOutputState ?? "Execute"}
                exactScoreDisplayEnabled={exactScoreDisplayEnabled}
              />
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted" />
          </>
        )}
        <span title="Score now">
          <ScoreBadge score={row.score} state={row.outputState} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        </span>
      </span>

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
        <span>Entry {formatUsd(row.entry)}</span>
        {row.stopLoss != null && <span className="text-bear">Stop {formatUsd(row.stopLoss)}</span>}
        {row.takeProfit1 != null && <span className="text-bull">TP1 {formatUsd(row.takeProfit1)}</span>}
        <button
          onClick={() => onRemove(row.symbol)}
          title="Stop tracking this setup"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-background hover:text-bear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
