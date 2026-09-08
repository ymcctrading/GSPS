"use client";

import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { SaveSetupButton } from "@/components/scan/save-setup-button";
import { SCANNER_STATE_META, type RulesAlignmentTier } from "@/lib/signals/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { formatUsd, cn } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";

export interface ScanRow {
  symbol: string;
  score: number;
  outputState: string;
  direction: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  patternName?: string | null;
  setupKind?: "reversion" | "continuation";
  /**
   * The instrument's price at scan time — stocks, equities, futures, forex,
   * whatever the symbol is. `null`/`undefined` for rows priced before this
   * field existed.
   */
  currentPrice?: number | null;
  /**
   * The Signal and Regime Engine's own rollup — a separate read from
   * `score`/`outputState` above, never merged into them. `undefined` for
   * rows built from a persisted `daily_scans` row (that table doesn't carry
   * this engine's verdict yet); `null` when a live scan ran it and no state
   * qualified.
   */
  signal?: PublicSignalSummary | null;
}

const TIER_LABEL: Record<RulesAlignmentTier, string> = {
  watchlistOnly: "Watchlist",
  qualified: "Qualified",
  aTier: "A-tier",
  aPlusTier: "A+",
};

export function ResultsTable({ rows, emptyText }: { rows: ScanRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyText ?? "No results yet."}</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          {/* The symbol pins while the price columns scroll — otherwise a phone
              user scrolling right loses track of which row they're reading. */}
          <TH className="sticky left-0 z-10 bg-surface">Symbol</TH>
          <TH className="text-right">Price</TH>
          <TH>Score</TH>
          <TH>Setup</TH>
          <TH className="text-right">Entry</TH>
          <TH className="text-right">Stop</TH>
          <TH className="text-right">TP1</TH>
          <TH className="text-right">Master</TH>
          <TH>Signal Engine</TH>
          <TH className="w-8" aria-label="Save" />
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <ResultsRow key={`${r.symbol}-${r.direction}`} row={r} />
        ))}
      </TBody>
    </Table>
  );
}

/**
 * A stored setup's score and levels are only ever as fresh as the scan that
 * wrote them — the trigger stays on screen looking just as precise long
 * after price has traded through its own stop and the thesis it was armed
 * on is dead (see the 2026-09-08 AVGO/IREN incident: a setup priced at
 * 9:15am read as an untouched Sell 22 minutes later with price already
 * ~8% past the stop). Polled independently of the order ticket's own check
 * so a setup reads as invalidated here before a user ever opens it.
 *
 * 30s rather than the header/chart's 5s — this is a list-wide sanity check,
 * not an execution price, so it doesn't need to compete for the same
 * request budget (see docs/THIRD_PARTY_LIMITS.md).
 */
function ResultsRow({ row: r }: { row: ScanRow }) {
  const quote = useLiveQuote(r.entry != null && r.stopLoss != null ? r.symbol : null, {
    intervalMs: 30_000,
  });
  const invalidated =
    r.entry != null &&
    r.stopLoss != null &&
    quote != null &&
    isInvalidatedByStop(
      { side: r.direction === "bearish" ? "sell" : "buy", limit_price: null, stop_price: r.stopLoss },
      quote.price,
    );

  return (
    <TR className={cn(invalidated && "opacity-60")}>
      <TD className="sticky left-0 z-10 bg-surface">
        <Link href={tickerHref(r.symbol)} className="font-medium text-accent hover:underline">
          {r.symbol}
        </Link>
      </TD>
      <TD className="text-right font-mono">
        {quote != null
          ? formatUsd(quote.price)
          : r.currentPrice != null && r.currentPrice > 0
            ? formatUsd(r.currentPrice)
            : "—"}
      </TD>
      <TD>
        <div className="flex flex-col items-start gap-1">
          <ScoreBadge score={r.score} state={r.outputState} />
          {invalidated && <Badge variant="bear">Invalidated</Badge>}
        </div>
      </TD>
      {/* Four empty price columns need a reason on the row itself —
          otherwise a scored symbol reads as a setup whose numbers failed
          to load. No trigger armed means there is nothing to price. */}
      <TD className="text-muted">
        {r.entry == null ? (
          <span className="italic">no trade plan</span>
        ) : (
          <>
            {r.patternName ? `${r.patternName} ` : ""}
            <span className={r.direction === "bullish" ? "text-bull" : r.direction === "bearish" ? "text-bear" : ""}>
              {r.direction === "bullish" ? "Buy" : r.direction === "bearish" ? "Sell" : "—"}
            </span>
            {/* A continuation trades WITH the trend the rest of the list
                is fading, so it can't read as just another row. */}
            {r.setupKind === "continuation" && (
              <Badge variant="muted" className="ml-1.5 align-middle">continuation</Badge>
            )}
            {invalidated && (
              <p className="mt-0.5 text-xs font-normal text-bear">
                Price has {r.direction === "bearish" ? "risen" : "fallen"} through the stop —
                thesis no longer holds.
              </p>
            )}
          </>
        )}
      </TD>
      <TD className={cn("text-right font-mono", invalidated && "line-through")}>
        {r.entry != null ? formatUsd(r.entry) : "—"}
      </TD>
      <TD className={cn("text-right font-mono text-bear", invalidated && "line-through")}>
        {r.stopLoss != null ? formatUsd(r.stopLoss) : "—"}
      </TD>
      <TD className={cn("text-right font-mono text-bull", invalidated && "line-through")}>
        {r.takeProfit1 != null ? formatUsd(r.takeProfit1) : "—"}
      </TD>
      <TD className={cn("text-right font-mono", invalidated && "line-through")}>
        {r.masterProfit != null ? formatUsd(r.masterProfit) : "—"}
      </TD>
      <TD>
        {r.signal ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Badge variant={r.signal.tradeable ? "bull" : "muted"}>{TIER_LABEL[r.signal.tier]}</Badge>
            <span className="text-xs text-muted">{SCANNER_STATE_META[r.signal.state].label}</span>
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </TD>
      <TD>
        <SaveSetupButton row={r} />
      </TD>
    </TR>
  );
}
