/**
 * Measures Gann's Overnight method (*Master Stock Market Course* Ch. 3,
 * `lib/gann/overnightChart.ts`) on daily bars: in on a crossing of the last
 * Overnight top or bottom by a point, out a point beyond the last Overnight
 * bottom or top, reversed by Rule 4 when a nearby top or bottom gives the new
 * stop. Optionally also the worked log's half-way-point entries.
 *
 * Why it exists: Gann claims the method needs "no judgement", and his own log
 * of it (U.S. Steel 1915-1930) is hindsight paper trading he chose levels for.
 * GSPS does not reverse a broken plan today (`lib/gann/stopBreach.ts`), and
 * whether it should is the owner's call. This is the measurement that call
 * needs. It places nothing, and no verdict reads it.
 *
 * Reported in R (multiples of each trade's initial risk) after the platform's
 * per-share friction, with a normal-approximation 95% interval on the mean,
 * split by how each trade opened and by the early and late half of the trades,
 * so a result that holds in only one regime shows.
 *
 * Three-question basis: as `overnightChart.ts`. Cycles: the halves are the
 * persistence check Dewey asks for (C06), not a periodicity claim.
 */

import type { Bar } from "@/lib/types";
import { fetchSeries } from "@/lib/backtest/run";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import { overnightTradeR, walkOvernightSystem, type OvernightTrade } from "@/lib/gann/overnightChart";

export interface OvernightStats {
  trades: number;
  winRate: number | null;
  expectancyR: number | null;
  /** 95% interval on the mean R, normal approximation. */
  ci95: [number, number] | null;
}

export interface OvernightReplayResult {
  symbol: string;
  bars: number;
  trades: (OvernightTrade & { date: string; r: number })[];
}

export interface OvernightReplaySummary {
  all: OvernightStats;
  byOpened: Record<OvernightTrade["opened"], OvernightStats>;
  reversals: number;
  halves: { early: OvernightStats; late: OvernightStats };
}

export function statsOf(rs: number[]): OvernightStats {
  const n = rs.length;
  if (n === 0) return { trades: 0, winRate: null, expectancyR: null, ci95: null };
  const mean = rs.reduce((s, r) => s + r, 0) / n;
  const sd = n > 1 ? Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0;
  return { trades: n, winRate: rs.filter((r) => r > 0).length / n, expectancyR: mean, ci95: n > 1 ? [mean - half, mean + half] : null };
}

export function replayOvernight(
  symbol: string,
  daily: Bar[],
  options: { halfwayEntries?: boolean; costPerShare?: number } = {},
): OvernightReplayResult {
  const cost = options.costPerShare ?? DEFAULT_COST_PER_SHARE_USD;
  const walk = walkOvernightSystem(daily, { halfwayEntries: options.halfwayEntries });
  const trades = walk.trades.flatMap((t) => {
    const r = overnightTradeR(t, cost);
    return r === null ? [] : [{ ...t, date: daily[t.entryIndex].t.slice(0, 10), r }];
  });
  return { symbol, bars: daily.length, trades };
}

export function summariseOvernight(results: OvernightReplayResult[]): OvernightReplaySummary {
  const all = results.flatMap((r) => r.trades).sort((a, b) => a.date.localeCompare(b.date));
  const rs = all.map((t) => t.r);
  const mid = Math.floor(all.length / 2);
  const by = (o: OvernightTrade["opened"]) => statsOf(all.filter((t) => t.opened === o).map((t) => t.r));
  return {
    all: statsOf(rs),
    byOpened: { crossing: by("crossing"), reversal: by("reversal"), halfway: by("halfway") },
    reversals: all.filter((t) => t.reason === "reversed").length,
    halves: { early: statsOf(rs.slice(0, mid)), late: statsOf(rs.slice(mid)) },
  };
}

export async function replayOvernightForUniverse(
  symbols: string[],
  options: { halfwayEntries?: boolean } = {},
): Promise<{ results: OvernightReplayResult[]; skipped: { symbol: string; reason: string }[]; summary: OvernightReplaySummary }> {
  const results: OvernightReplayResult[] = [];
  const skipped: { symbol: string; reason: string }[] = [];
  for (const symbol of symbols) {
    try {
      const { daily } = await fetchSeries(symbol, "1Day");
      if (daily.length < 30) {
        skipped.push({ symbol, reason: "fewer than 30 daily bars" });
        continue;
      }
      results.push(replayOvernight(symbol, daily, options));
    } catch (err) {
      skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results, skipped, summary: summariseOvernight(results) };
}
