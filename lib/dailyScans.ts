/**
 * Shared reader for the market-wide daily scan (15 bullish + 15 bearish).
 * Used by the dashboard preview and the full per-direction lists.
 */

import { createClient } from "@/lib/supabase/server";
import { pricedBeforeSession, scanFreshness, type ScanFreshness } from "@/lib/scan/freshness";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import type { ScanRow } from "@/components/scan/results-table";
import type { DecisionState, PublicScoreSummary, ScanDecision, ScoreBreakdownItem, SetupKind } from "@/lib/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";

export type Direction = "bullish" | "bearish";

interface DailyScanRow {
  symbol: string;
  direction: Direction;
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  scan_date: string;
  detail: {
    pattern?: { name?: string } | null;
    setupKind?: string | null;
    scannedAt?: string | null;
    currentPrice?: number | null;
    dayRange?: number | null;
    decisionState?: DecisionState | null;
    setAsideEntry?: { setupKind: SetupKind; direction: "bullish" | "bearish" } | null;
    /** Rows written before 2026-10-21 only; see `lib/scan/publish.ts`. */
    breakdown?: ScoreBreakdownItem[] | null;
    scoreSummary?: PublicScoreSummary | null;
    retired?: boolean | null;
    trends?: { timeframe: string; direction: string }[] | null;
    signal?: PublicSignalSummary | null;
  } | null;
}

/**
 * A published row must carry the whole trade plan. The scan pipeline now
 * guarantees it, but rows written before that are still in the table and would
 * otherwise keep rendering as scored setups with four empty price columns —
 * so the reader drops them too, rather than waiting for the next daily run.
 */
export function isComplete(r: Pick<DailyScanRow, "entry" | "stop_loss" | "take_profit_1" | "master_profit">): boolean {
  return [r.entry, r.stop_loss, r.take_profit_1, r.master_profit].every(
    // Coerced rather than typeof-checked: a driver that hands back `numeric`
    // as a string must not empty the whole dashboard.
    (v) => v !== null && v !== undefined && Number.isFinite(Number(v)),
  );
}

/**
 * A setup whose price already broke the stop before the scan ever ran is not
 * a "Watch" candidate — it's dead structure, same as the ticker page's
 * invalidation banner (`isInvalidatedByStop`). Checked against the scan-time
 * price, since that's all this reader has; a setup that breaks its stop
 * intraday after the scan runs is still caught on the next run.
 */
export function isInvalidated(
  r: Pick<DailyScanRow, "direction" | "stop_loss"> & {
    detail?: {
      retired?: boolean | null;
      currentPrice?: number | null;
      breakdown?: { key?: string; passed: boolean }[] | null;
    } | null;
  },
): boolean {
  if (isRetiredByScan(r)) return true;
  const price = r.detail?.currentPrice;
  if (price == null || !Number.isFinite(price)) return false;
  const side = r.direction === "bullish" ? "buy" : "sell";
  return isInvalidatedByStop({ side, stop_price: r.stop_loss }, price);
}

/**
 * The scan itself retired this plan: its own stop broke during the session
 * (`applyStopBreachHold`, `lib/gann/stopBreach.ts`), which can happen with the
 * scan-time price back above the stop, so the price check above misses it.
 * Rows published before `hasTradePlan` refused retired plans are still in the
 * table; this keeps them off every list that reads it.
 */
export function isRetiredByScan(r: {
  detail?: { retired?: boolean | null; breakdown?: { key?: string; passed: boolean }[] | null } | null;
}): boolean {
  if (r.detail?.retired === true) return true;
  const breakdown = r.detail?.breakdown;
  return Array.isArray(breakdown) && breakdown.some((b) => b.key === "stopBreach" && !b.passed);
}

/**
 * The rollup the setup card lists under "What lined up". The stored `breakdown`
 * is the scoring model written out longhand and stays on this side of the
 * server/client boundary (`lib/scoring/public-summary.ts`); only the per-pillar
 * counts are handed to the row. Null for a row persisted before the breakdown
 * was kept, or one whose stored breakdown carries no pillars.
 */
function toScoreSummary(r: DailyScanRow): ScanRow["scoreSummary"] {
  const stored = r.detail?.scoreSummary;
  if (stored && Array.isArray(stored.pillars)) return stored.pillars.length > 0 ? stored : null;
  const breakdown = r.detail?.breakdown;
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  const decision: ScanDecision = {
    score: r.score,
    outputState: r.output_state as ScanDecision["outputState"],
    breakdown,
  };
  const summary = toPublicScoreSummary(decision);
  return summary.pillars.length > 0 ? summary : null;
}

function toRow(r: DailyScanRow): ScanRow {
  return {
    symbol: r.symbol,
    score: r.score,
    outputState: r.output_state,
    direction: r.direction,
    entry: r.entry,
    stopLoss: r.stop_loss,
    takeProfit1: r.take_profit_1,
    masterProfit: r.master_profit,
    patternName: r.detail?.pattern?.name ?? null,
    // Rows written before continuations existed carry no kind; they were all
    // reversions, which is also what the column defaults to reading as.
    setupKind: r.detail?.setupKind === "continuation" ? "continuation" : "reversion",
    currentPrice: r.detail?.currentPrice ?? null,
    // Null on a row published before the field existed: the list then keeps
    // the plan where its verdict put it (lib/setups/resting.ts).
    dayRange: r.detail?.dayRange ?? null,
    decisionState: r.detail?.decisionState ?? null,
    setAsideEntry: r.detail?.setAsideEntry ?? null,
    // undefined (not yet computed at write time) collapses to null here —
    // ScanRow's contract only distinguishes "no live scan ran this" from
    // "ran and nothing qualified" for the manual scanner; a persisted row
    // that predates this field reads the same as the latter, which is the
    // closer of the two false readings.
    signal: r.detail?.signal ?? null,
    scoreSummary: toScoreSummary(r),
    trends: Array.isArray(r.detail?.trends) ? r.detail!.trends : null,
  };
}

export interface DailyScans {
  configured: boolean;
  scanDate: string | null;
  /**
   * How old the stored plan is. The reader always returns the newest scan it
   * has, however old that is, so every consumer needs to be able to say so —
   * a list from a closed session must not render as though it were today's.
   */
  freshness: ScanFreshness;
  /**
   * True when the run that priced these levels happened before its own
   * session opened — the pre-open cron, whose closed 15-minute bars belong to
   * the day before. Dated today, priced yesterday.
   */
  pricedBeforeSession: boolean;
  /**
   * When the run that produced today's rows actually executed, ISO 8601 —
   * distinct from `scanDate`, which is the session the rows are dated for.
   * Null when no scan has ever recorded it. Lets the dashboard preview say
   * "Scanned HH:MM" instead of silently reusing a cached run.
   */
  scannedAt: string | null;
  bullish: ScanRow[];
  bearish: ScanRow[];
}

const NO_SCAN = (configured: boolean): DailyScans => ({
  configured,
  scanDate: null,
  freshness: scanFreshness(null, new Date()),
  pricedBeforeSession: false,
  scannedAt: null,
  bullish: [],
  bearish: [],
});

export async function getDailyScans(): Promise<DailyScans> {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!configured) return NO_SCAN(false);

  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("daily_scans")
    .select("scan_date")
    .order("scan_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scanDate = latest?.scan_date ?? null;
  if (!scanDate) return NO_SCAN(true);

  const { data } = await supabase
    .from("daily_scans")
    .select("*")
    .eq("scan_date", scanDate)
    .order("rank");
  const rows = ((data ?? []) as DailyScanRow[]).filter(isComplete).filter((r) => !isInvalidated(r));

  // The most recent write wins: a day can be scanned twice, and it is the run
  // that produced the rows now on screen whose timing matters.
  const scannedAt = rows
    .map((r) => r.detail?.scannedAt)
    .filter((t): t is string => typeof t === "string")
    .sort()
    .at(-1);

  return {
    configured: true,
    scanDate,
    freshness: scanFreshness(scanDate, new Date()),
    pricedBeforeSession: pricedBeforeSession(scanDate, scannedAt),
    scannedAt: scannedAt ?? null,
    bullish: rows.filter((r) => r.direction === "bullish").map(toRow),
    bearish: rows.filter((r) => r.direction === "bearish").map(toRow),
  };
}
