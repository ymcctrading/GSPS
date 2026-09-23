"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
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
   * `score`/`outputState` above, never merged into them. `null` when no
   * state qualified (true of both a live scan and a persisted `daily_scans`
   * row — see `lib/dailyScans.ts#toRow`); `undefined` only for a row shape
   * that never asked the question at all.
   */
  signal?: PublicSignalSummary | null;
}

const TIER_LABEL: Record<RulesAlignmentTier, string> = {
  watchlistOnly: "Watchlist",
  qualified: "Qualified",
  aTier: "A-tier",
  aPlusTier: "A+",
};

function rowKey(r: ScanRow): string {
  return `${r.symbol}-${r.direction}`;
}

export function ResultsTable({
  rows,
  emptyText,
  onRemove,
  /**
   * Defaults to `false` (rounded to the nearest half point) — the safe,
   * Novice-tier-equivalent default when a caller hasn't resolved the
   * viewer's tier. See `lib/scoring/tier-display.ts`.
   */
  exactScoreDisplayEnabled = false,
}: {
  rows: ScanRow[];
  emptyText?: string;
  /** When provided, each row gets a manual remove control that calls this. */
  onRemove?: (symbol: string) => void;
  exactScoreDisplayEnabled?: boolean;
}) {
  /**
   * Whether price has already broken a row's stop is only known once its
   * live quote has loaded — client-side, after mount. Ranking above stays a
   * static snapshot from scan time, so an invalidated setup would otherwise
   * sit right where the scan scored it, styled a little differently but
   * still read as a suggestion. Tracking it here instead of only inside
   * `ResultsRow` lets a dead setup drop out of the ranked group the moment
   * it's detected, rather than staying mixed in among live picks forever.
   */
  const [invalidated, setInvalidated] = useState<Record<string, boolean>>({});
  const handleInvalidatedChange = useCallback((key: string, value: boolean) => {
    setInvalidated((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  // A Gann-score Reject row is not a "populated setup" -- the platform's whole
  // point is surfacing the setups closest to 9, and a 0-3/9 row sitting in the
  // same ranked list reads as though it earned a slot next to a Watch/Execute
  // row. Kept out of the primary table and collapsed under an explicit count
  // instead, mirroring the audit-trail pattern IntradayAlerts already uses for
  // "everything else that was scanned and didn't qualify" -- available on
  // request, never competing for the ranked list's attention.
  //
  // Exception: the Signal and Regime Engine is a separate, non-merged read
  // (see the column's own doc comment above) -- a row can score low on the
  // Gann/STRAT criteria and still carry a real Watch/Qualified/tradeable
  // rollup from that engine. That is a second, independent opportunity, not
  // noise, so any row with a `signal` at all stays in the primary list
  // regardless of its Gann score. Only a Reject row with nothing else going
  // for it -- no signal rollup either -- gets collapsed.
  const [showRejected, setShowRejected] = useState(false);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyText ?? "No results yet."}</p>;
  }

  const qualifying = rows.filter((r) => r.outputState !== "Reject" || r.signal != null);
  const rejected = rows.filter((r) => r.outputState === "Reject" && r.signal == null);

  if (qualifying.length === 0 && rejected.length > 0) {
    return (
      <div className="py-8 text-center text-sm text-muted">
        <p>{emptyText ?? "No symbols qualified as a setup."}</p>
        <RejectedToggle count={rejected.length} open={showRejected} onToggle={() => setShowRejected((v) => !v)} />
        {showRejected && <RejectedTable rows={rejected} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />}
      </div>
    );
  }

  const live = qualifying.filter((r) => !invalidated[rowKey(r)]);
  const dead = qualifying.filter((r) => invalidated[rowKey(r)]);

  return (
    <>
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
          {onRemove && <TH className="w-8" aria-label="Remove" />}
        </TR>
      </THead>
      <TBody>
        {live.map((r) => (
          <ResultsRow
            key={rowKey(r)}
            row={r}
            onInvalidatedChange={handleInvalidatedChange}
            onRemove={onRemove}
            exactScoreDisplayEnabled={exactScoreDisplayEnabled}
          />
        ))}
        {dead.length > 0 && (
          <TR className="hover:bg-transparent">
            <TD colSpan={onRemove ? 11 : 10} className="sticky left-0 z-10 bg-surface py-2 text-xs font-medium uppercase tracking-wide text-muted">
              No longer valid — price already broke the stop
            </TD>
          </TR>
        )}
        {dead.map((r) => (
          <ResultsRow
            key={rowKey(r)}
            row={r}
            onInvalidatedChange={handleInvalidatedChange}
            onRemove={onRemove}
            exactScoreDisplayEnabled={exactScoreDisplayEnabled}
          />
        ))}
      </TBody>
    </Table>
    {rejected.length > 0 && (
      <div className="mt-2">
        <RejectedToggle count={rejected.length} open={showRejected} onToggle={() => setShowRejected((v) => !v)} />
        {showRejected && <RejectedTable rows={rejected} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />}
      </div>
    )}
    </>
  );
}

function RejectedToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-xs text-muted hover:text-foreground hover:underline"
    >
      {open ? "Hide" : "Show"} {count} scanned but not qualified (score too low)
    </button>
  );
}

/** Minimal, symbol/score/setup only — these didn't earn a trade plan, so the
 * full price-column table would just be four dashes per row. */
function RejectedTable({
  rows,
  exactScoreDisplayEnabled,
}: {
  rows: ScanRow[];
  exactScoreDisplayEnabled: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="sticky left-0 z-10 bg-surface">Symbol</TH>
          <TH className="text-right">Price</TH>
          <TH>Score</TH>
          <TH>Setup</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={rowKey(r)}>
            <TD className="sticky left-0 z-10 bg-surface">
              <Link href={tickerHref(r.symbol)} className="font-medium text-accent hover:underline">
                {r.symbol}
              </Link>
            </TD>
            <TD className="text-right font-mono">{r.currentPrice != null && r.currentPrice > 0 ? formatUsd(r.currentPrice) : "—"}</TD>
            <TD>
              <ScoreBadge score={r.score} state={r.outputState} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
            </TD>
            <TD className="text-muted">
              {r.patternName ? `${r.patternName} ` : ""}
              <span className={r.direction === "bullish" ? "text-bull" : r.direction === "bearish" ? "text-bear" : ""}>
                {r.direction === "bullish" ? "Buy" : r.direction === "bearish" ? "Sell" : "—"}
              </span>
            </TD>
          </TR>
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
function ResultsRow({
  row: r,
  onInvalidatedChange,
  onRemove,
  exactScoreDisplayEnabled,
}: {
  row: ScanRow;
  onInvalidatedChange?: (key: string, value: boolean) => void;
  onRemove?: (symbol: string) => void;
  exactScoreDisplayEnabled: boolean;
}) {
  const quote = useLiveQuote(r.entry != null && r.stopLoss != null ? r.symbol : null, {
    intervalMs: 30_000,
  });
  const freshlyInvalidated =
    r.entry != null &&
    r.stopLoss != null &&
    quote != null &&
    isInvalidatedByStop(
      { side: r.direction === "bearish" ? "sell" : "buy", stop_price: r.stopLoss },
      quote.price,
    );

  /**
   * A one-way ratchet, not a toggle. The shared quote poller can drop back to
   * `null` between polls -- rate-limit backoff, a resubscribe when the
   * listener count briefly hits zero -- and recomputing `invalidated` fresh
   * from whatever `quote` happens to be right now turned every one of those
   * gaps into "un-invalidated," then re-invalidated again once a fresh quote
   * landed. That's what read as the row flickering in/out of the dead
   * section on the Dashboard. It's also wrong on the merits: "price broke
   * the stop" is a fact about what already happened, not a live reading that
   * un-happens because the feed hiccuped or price ticked back over the line.
   * Once observed true, it stays true for this row's lifetime.
   */
  const [invalidated, setInvalidated] = useState(false);
  if (freshlyInvalidated && !invalidated) {
    // Adjusting state during render (React's documented pattern for this,
    // not an effect) -- guarded so it only fires the render where the ratchet
    // actually flips, never looping.
    setInvalidated(true);
  }

  useEffect(() => {
    onInvalidatedChange?.(rowKey(r), invalidated);
  }, [invalidated, onInvalidatedChange, r]);

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
          <ScoreBadge score={r.score} state={r.outputState} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
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
      {onRemove && (
        <TD>
          <button
            onClick={() => onRemove(r.symbol)}
            title="Stop tracking this setup"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-background hover:text-bear"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TD>
      )}
    </TR>
  );
}
