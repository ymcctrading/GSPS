"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { SaveSetupButton } from "@/components/scan/save-setup-button";
import { SetupCardPanel, SetupNameButton, useCardStage } from "@/components/setups/setup-card";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import type { DecisionState, PublicScoreSummary, SetupKind } from "@/lib/types";
import { buildDailyCardModel } from "@/lib/setups/card";
import { readResting, restingDistanceLabel, restingInputOfRow, splitResting } from "@/lib/setups/resting";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { formatUsd, cn } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { isFundMarket } from "@/lib/market/otherMarkets";

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
   * A day's range (the daily average true range, `PublicScanResult.dayRange`). An
   * Execute row whose entry sits further than this from price is a resting
   * order and is listed apart (`lib/setups/resting.ts`). Null or absent: not
   * known, and the row stays where its verdict put it.
   */
  dayRange?: number | null;
  /**
   * The scan's Resting tier flag (`ScanDecision.resting`, `setupTier`): the
   * plan would be Execute but its order rests at its level. Null or absent on
   * a row stored before it, when the tier is read from the score and distance.
   */
  resting?: boolean | null;
  /** The decision state (`lib/scoring/decisionState.ts`); the verdict badge already reads it one to one. */
  decisionState?: DecisionState | null;
  /** The buying point against the trend that also armed and was set aside (never-failing rule 5). */
  setAsideEntry?: { setupKind: SetupKind; direction: "bullish" | "bearish" } | null;
  /**
   * The Signal and Regime Engine's own rollup — a separate read from
   * `score`/`outputState` above, never merged into them. `null` when no
   * state qualified (true of both a live scan and a persisted `daily_scans`
   * row — see `lib/dailyScans.ts#toRow`); `undefined` only for a row shape
   * that never asked the question at all.
   */
  signal?: PublicSignalSummary | null;
  /**
   * The publishable rollup of the score — points met per pillar, never which
   * named condition decided it (`lib/scoring/public-summary.ts`). What the
   * setup card lists under "What lined up". Absent on a row persisted before
   * the card existed, in which case the card shows the score and the plan only.
   */
  scoreSummary?: PublicScoreSummary | null;
  /** Higher-timeframe direction readings, for the card's "Higher timeframes" line. */
  trends?: { timeframe: string; direction: string }[] | null;
}

/** What the Resting tier means, in the words every list shows it under. */
export const RESTING_NOTE =
  "Plans with every condition met whose entry is more than a day's range from price. Each waits at its level for price to come back; none is a trade to take today.";

/** Symbol + Price + Entry + Exit + TP1 + MTP + Save. */
const BASE_COLUMNS = 7;

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
  restingHeading = true,
}: {
  rows: ScanRow[];
  emptyText?: string;
  /**
   * Whether the Resting rows carry their own "Resting orders" heading. Off
   * where the caller already lists each tier under its own heading (the
   * manual scan's results, `components/scan/manual-scan-results.tsx`).
   */
  restingHeading?: boolean;
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
  // No exception for a Signal and Regime Engine read (2026-10-21, review of
  // #393 finding 2): only Gann's score shows (owner), and Gann's verdict
  // decides which setups are listed, so a row Gann rejected is collapsed
  // whatever that engine read.
  const [showRejected, setShowRejected] = useState(false);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyText ?? "No results yet."}</p>;
  }

  const qualifying = rows.filter((r) => r.outputState !== "Reject");
  const rejected = rows.filter((r) => r.outputState === "Reject");

  if (qualifying.length === 0 && rejected.length > 0) {
    return (
      <div className="py-8 text-center text-sm text-muted">
        <p>{emptyText ?? "No symbols qualified as a setup."}</p>
        <RejectedToggle count={rejected.length} open={showRejected} onToggle={() => setShowRejected((v) => !v)} />
        {showRejected && <RejectedTable rows={rejected} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />}
      </div>
    );
  }

  const stillLive = qualifying.filter((r) => !invalidated[rowKey(r)]);
  const dead = qualifying.filter((r) => invalidated[rowKey(r)]);
  // An Execute plan whose entry is more than a day's range from price is a
  // resting order, listed apart and out of Execute (owner, 2026-10-21;
  // lib/setups/resting.ts). Split on the scan-time price, so the list a row
  // sits in does not move with every quote; its card reads the live price.
  const { now: liveAll, resting } = splitResting(stillLive, (r) => restingInputOfRow(r));
  // Crypto pairs and the commodity and currency funds are their own markets
  // (SYNTHESIZED_ROADMAP Q2 item 2; Gann's capital rules count them apart,
  // three markets beside five stocks), so each is listed under its own heading.
  const crypto = liveAll.filter((r) => isCryptoSymbol(r.symbol));
  const funds = liveAll.filter((r) => isFundMarket(r.symbol));
  const live = liveAll.filter((r) => !isCryptoSymbol(r.symbol) && !isFundMarket(r.symbol));
  const sectionProps = { onInvalidatedChange: handleInvalidatedChange, onRemove, exactScoreDisplayEnabled };

  return (
    <>
    {(live.length > 0 || dead.length > 0) && (
    <Table>
      <THead>
        <TR>
          {/* The symbol pins while the price columns scroll — otherwise a phone
              user scrolling right loses track of which row they're reading. */}
          <TH className="sticky left-0 z-10 bg-surface">Symbol</TH>
          <TH className="text-right">Price</TH>
          <TH className="text-right">Entry</TH>
          <TH className="text-right" title="Exit: the stop-loss, the price that says the setup failed">
            Exit (S/L)
          </TH>
          <TH className="text-right">TP1</TH>
          <TH className="text-right" title="Master take profit">
            MTP
          </TH>
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
            <TD colSpan={onRemove ? BASE_COLUMNS + 1 : BASE_COLUMNS} className="sticky left-0 z-10 bg-surface py-2 text-xs font-medium uppercase tracking-wide text-muted">
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
    )}
    <MarketSection
      rows={crypto}
      testId="crypto-setups"
      title="Crypto"
      note="The same method read on crypto pairs, which trade every day of the week. The broker trades them spot, so a sell setup can't be placed as a short."
      spaced={live.length > 0 || dead.length > 0}
      {...sectionProps}
    />
    <MarketSection
      rows={funds}
      testId="fund-setups"
      title="Commodities and currencies"
      note="The same method read on the listed funds that hold commodity and currency futures. A fund stands in for the futures: it trades as shares and loses a little each time its futures roll."
      spaced={live.length > 0 || dead.length > 0 || crypto.length > 0}
      {...sectionProps}
    />
    {resting.length > 0 && (
      <div
        className={cn(live.length > 0 || dead.length > 0 || crypto.length > 0 || funds.length > 0 ? "mt-4" : undefined)}
        data-testid="resting-orders"
      >
        {restingHeading && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Resting orders</p>
            <p className="mb-1 text-xs text-muted">{RESTING_NOTE}</p>
          </>
        )}
        <Table>
          <THead>
            <TR>
              <TH className="sticky left-0 z-10 bg-surface">Symbol</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Entry</TH>
              <TH className="text-right">Exit (S/L)</TH>
              <TH className="text-right">TP1</TH>
              <TH className="text-right">MTP</TH>
              <TH className="w-8" aria-label="Save" />
              {onRemove && <TH className="w-8" aria-label="Remove" />}
            </TR>
          </THead>
          <TBody>
            {resting.map((r) => (
              <ResultsRow
                key={rowKey(r)}
                row={r}
                resting
                onInvalidatedChange={handleInvalidatedChange}
                onRemove={onRemove}
                exactScoreDisplayEnabled={exactScoreDisplayEnabled}
              />
            ))}
          </TBody>
        </Table>
      </div>
    )}
    {rejected.length > 0 && (
      <div className="mt-2">
        <RejectedToggle count={rejected.length} open={showRejected} onToggle={() => setShowRejected((v) => !v)} />
        {showRejected && <RejectedTable rows={rejected} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />}
      </div>
    )}
    </>
  );
}

/** A market listed under its own heading (crypto, the funds), with the same columns as the stocks. */
function MarketSection({
  rows,
  testId,
  title,
  note,
  spaced,
  onInvalidatedChange,
  onRemove,
  exactScoreDisplayEnabled,
}: {
  rows: ScanRow[];
  testId: string;
  title: string;
  note: string;
  spaced: boolean;
  onInvalidatedChange: (key: string, value: boolean) => void;
  onRemove?: (symbol: string) => void;
  exactScoreDisplayEnabled: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={cn(spaced ? "mt-4" : undefined)} data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="mb-1 text-xs text-muted">{note}</p>
      <Table>
        <THead>
          <TR>
            <TH className="sticky left-0 z-10 bg-surface">Symbol</TH>
            <TH className="text-right">Price</TH>
            <TH className="text-right">Entry</TH>
            <TH className="text-right">Exit (S/L)</TH>
            <TH className="text-right">TP1</TH>
            <TH className="text-right">MTP</TH>
            <TH className="w-8" aria-label="Save" />
            {onRemove && <TH className="w-8" aria-label="Remove" />}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <ResultsRow
              key={rowKey(r)}
              row={r}
              onInvalidatedChange={onInvalidatedChange}
              onRemove={onRemove}
              exactScoreDisplayEnabled={exactScoreDisplayEnabled}
            />
          ))}
        </TBody>
      </Table>
    </div>
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
  resting = false,
  onInvalidatedChange,
  onRemove,
  exactScoreDisplayEnabled,
}: {
  row: ScanRow;
  /** Listed under "Resting orders": the row shows its distance from price to entry. */
  resting?: boolean;
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

  const { stage, setStage, toggleName } = useCardStage();
  const cardId = `setup-card-${rowKey(r).replace(/[^a-zA-Z0-9-]/g, "_")}`;
  const model = buildDailyCardModel(r, {
    scoreText: formatScore(r.score, exactScoreDisplayEnabled),
    scoreMax: SCORE_MAX,
    livePrice: quote?.price ?? null,
  });
  const columns = onRemove ? BASE_COLUMNS + 1 : BASE_COLUMNS;
  // The distance is read at the scan-time price, the same price the list
  // was split on, so the row's figure and its place agree.
  const restingRead = resting ? readResting(restingInputOfRow(r)) : null;

  return (
    <Fragment>
      <TR className={cn(invalidated && "opacity-60")}>
        <TD className="sticky left-0 z-10 bg-surface">
          <div className="flex flex-col items-start gap-0.5">
            <SetupNameButton symbol={r.symbol} stage={stage} controls={cardId} onToggle={toggleName} />
            <span className="flex items-center gap-1.5 text-xs">
              {r.entry == null ? (
                <span className="italic text-muted">no trade plan</span>
              ) : (
                <span
                  className={
                    r.direction === "bullish" ? "text-bull" : r.direction === "bearish" ? "text-bear" : "text-muted"
                  }
                >
                  {r.direction === "bullish" ? "Buy" : r.direction === "bearish" ? "Sell" : "—"}
                </span>
              )}
              {invalidated && <Badge variant="bear">Invalidated</Badge>}
            </span>
            {restingRead && (
              <span className="text-xs text-muted" title="Distance from the scan-time price to the entry">
                Entry {restingDistanceLabel(restingRead)}
              </span>
            )}
          </div>
        </TD>
        <TD className="text-right font-mono">
          {quote != null
            ? formatUsd(quote.price)
            : r.currentPrice != null && r.currentPrice > 0
              ? formatUsd(r.currentPrice)
              : "—"}
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
        <TD className={cn("text-right font-mono text-bull", invalidated && "line-through")}>
          {r.masterProfit != null ? formatUsd(r.masterProfit) : "—"}
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
      {stage !== "closed" && (
        <TR className="hover:bg-transparent">
          <TD colSpan={columns} className="whitespace-normal py-2">
            {/* The row scrolls sideways on a phone; the card stays pinned to the
                left edge at the width of the screen, so it never opens off it. */}
            <div className="sticky left-0 w-[calc(100vw-3.5rem)] max-w-3xl sm:w-auto">
              <SetupCardPanel
                id={cardId}
                model={model}
                stage={stage}
                onStageChange={setStage}
                headline={
                  <ScoreBadge score={r.score} state={model.verdict} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
                }
                extra={
                  invalidated ? (
                    <p className="text-xs text-bear">
                      Price has {r.direction === "bearish" ? "risen" : "fallen"} through the stop this setup was staked
                      on, so its entry is a dead level. Look for a fresh setup instead.
                    </p>
                  ) : null
                }
              />
            </div>
          </TD>
        </TR>
      )}
    </Fragment>
  );
}
