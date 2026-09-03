import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { SaveSetupButton } from "@/components/scan/save-setup-button";
import { SCANNER_STATE_META, type RulesAlignmentTier } from "@/lib/signals/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { formatUsd } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";

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
   * Set only when the state sits below what the score alone implies — e.g. a
   * 7/9 held at Watch because the trade plan hasn't cleared every condition
   * for a live signal. Without this, a novice reads "7" next to "Watch" as
   * either a mistake or a hidden rule, since 7+ is the number Settings and
   * the glossary teach as the Execute threshold. Phrased the same way the
   * symbol detail page already does — see lib/scoring/public-summary.ts.
   */
  stateNote?: string | null;
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
          <TR key={`${r.symbol}-${r.direction}`}>
            <TD className="sticky left-0 z-10 bg-surface">
              <Link
                href={tickerHref(r.symbol)}
                className="font-medium text-accent hover:underline"
              >
                {r.symbol}
              </Link>
            </TD>
            <TD>
              <ScoreBadge score={r.score} state={r.outputState} />
              {r.stateNote && (
                <p className="mt-1 max-w-[14rem] whitespace-normal text-xs text-warn">
                  {r.stateNote}
                </p>
              )}
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
                </>
              )}
            </TD>
            <TD className="text-right font-mono">{r.entry != null ? formatUsd(r.entry) : "—"}</TD>
            <TD className="text-right font-mono text-bear">{r.stopLoss != null ? formatUsd(r.stopLoss) : "—"}</TD>
            <TD className="text-right font-mono text-bull">{r.takeProfit1 != null ? formatUsd(r.takeProfit1) : "—"}</TD>
            <TD className="text-right font-mono">{r.masterProfit != null ? formatUsd(r.masterProfit) : "—"}</TD>
            <TD>
              {r.signal ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Badge variant={r.signal.tradeable ? "bull" : "muted"}>
                    {TIER_LABEL[r.signal.tier]}
                  </Badge>
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
        ))}
      </TBody>
    </Table>
  );
}
