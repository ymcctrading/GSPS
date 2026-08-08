/**
 * Daily market-wide scan.
 *
 * Coarse pass: pull the most-active US equities and score cheap daily-bar
 * signals once per symbol, producing two candidate pools — reversions (trend
 * extension into a structural level) and continuations (a trend still
 * expanding, with volume behind it).
 *
 * Full pass: run the complete multi-timeframe scanTicker on the reversion
 * shortlist and keep the top `perSide` per direction. Reversions are the
 * protocol's primary setup, so they fill the lists first.
 *
 * Top-up pass: only when a direction comes up short — because nothing armed a
 * tradeable trigger there — the highest-momentum continuation candidates for
 * that direction are scanned and appended. A short list is an acceptable
 * outcome; a list padded with symbols that have no trade plan is not.
 */

import type { Bar, ScanResult, SetupKind } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { fetchMostActives } from "@/lib/data/alpaca";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { CONTINUATION_PATTERNS } from "@/lib/strat/patterns";
import { scanTicker } from "@/lib/scanTicker";
import { MAG7, SECTORS } from "@/lib/sectors";

// Fallback universe when the most-actives screener is unavailable (some Alpaca
// plans don't include it): the curated sector lists, equities only.
const FALLBACK_UNIVERSE = Array.from(
  new Set([
    ...MAG7,
    ...Object.values(SECTORS).flatMap((s) => s.symbols),
  ]),
).filter((s) => !s.includes("/"));

async function resolveUniverse(universeTop: number): Promise<string[]> {
  try {
    const actives = await fetchMostActives(universeTop);
    if (actives.length > 0) return actives;
  } catch {
    /* screener unavailable — fall back to the curated universe */
  }
  return FALLBACK_UNIVERSE;
}

interface CoarseCandidate {
  symbol: string;
  direction: "bullish" | "bearish";
  kind: SetupKind;
  coarseScore: number;
}

/**
 * Recent range expansion, as a multiple of the trailing baseline, that counts
 * as "a lot of momentum". Matches the threshold scanTicker scores its own
 * momentum criterion on, so the coarse gate and the full scan agree.
 */
export const MOMENTUM_EXPANSION = 1.2;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Recent volatility against its own trailing baseline, or 0 when unreadable. */
function expansionRatio(daily: Bar[]): number {
  const recent = atr(daily.slice(-20), 14);
  const baseline = atr(daily.slice(-100, -20), 14);
  return baseline > 0 ? recent / baseline : 0;
}

function coarseReversion(symbol: string, daily: Bar[]): CoarseCandidate | null {
  if (daily.length < 60) return null;
  const price = daily[daily.length - 1].c;
  const trend = readTrend(daily, "1Day");
  if (trend.direction === "sideways") return null;

  // A reversion candidate moves opposite its current extended trend.
  const direction = trend.direction === "bearish" ? "bullish" : "bearish";

  let score = 0;

  // Extension: distance of price from its 50-bar mean, in % — more extended,
  // more primed for reversion.
  const mean50 = mean(daily.slice(-50).map((b) => b.c));
  const extensionPct = (Math.abs(price - mean50) / mean50) * 100;
  if (extensionPct > 5) score += 1;
  if (extensionPct > 10) score += 1;

  // Proximity to a Gann fan line or Square-of-9 level
  const fans = computeFanLines(daily, price);
  if (fans.length > 0 && fans[0].distancePct <= 1.5) score += 2;
  const majorLow = Math.min(...daily.map((b) => b.l));
  const s9 = squareOf9Levels(majorLow, price);
  if (s9.length > 0 && s9[0].distancePct <= 1.0) score += 2;

  // Proximity to a clustered S/R level in the reversion direction
  const levels = direction === "bullish" ? trend.support : trend.resistance;
  if (levels.some((l) => (Math.abs(price - l) / price) * 100 <= 2)) score += 2;

  if (score < 3) return null;
  return { symbol, direction, kind: "reversion", coarseScore: score };
}

/**
 * The other side of the same daily bars: a trend that is still running, not one
 * stretched far enough to snap back. Scored on how much momentum is behind it,
 * because that is the whole reason to take a continuation — the gates are hard
 * (an expanding range, price holding the trend side of its mean) so the pool
 * stays small and the fills are the ones actually moving.
 */
function coarseContinuation(symbol: string, daily: Bar[]): CoarseCandidate | null {
  // Needs the full trailing window the baseline is measured over.
  if (daily.length < 120) return null;
  const price = daily[daily.length - 1].c;
  const trend = readTrend(daily, "1Day");
  if (trend.direction === "sideways") return null;

  // A continuation candidate moves WITH its trend.
  const direction = trend.direction;

  const ratio = expansionRatio(daily);
  if (ratio < MOMENTUM_EXPANSION) return null;

  // The trend has to still be intact, not rolling over into the pullback that
  // makes a reversion candidate: price on the trend side of its 20-bar mean.
  const mean20 = mean(daily.slice(-20).map((b) => b.c));
  const intact = direction === "bullish" ? price > mean20 : price < mean20;
  if (!intact) return null;

  let score = 2; // cleared the expansion gate
  if (ratio >= 1.5) score += 1;
  if (ratio >= 2) score += 1;

  // Participation: is the move being funded, or is it drifting on thin tape?
  const volRecent = mean(daily.slice(-10).map((b) => b.v));
  const volBaseline = mean(daily.slice(-60, -10).map((b) => b.v));
  if (volBaseline > 0 && volRecent / volBaseline >= 1.2) score += 1;

  // Distance travelled from the 50-bar mean in the trend direction — a trend
  // that has actually gone somewhere, scored the opposite way to a reversion.
  const mean50 = mean(daily.slice(-50).map((b) => b.c));
  const travelPct = mean50 > 0 ? ((price - mean50) / mean50) * 100 * (direction === "bullish" ? 1 : -1) : 0;
  if (travelPct > 3) score += 1;

  return { symbol, direction, kind: "continuation", coarseScore: score };
}

/**
 * A scan result is publishable to the daily lists only when it carries a
 * complete, finite trade plan. Every consumer of `daily_scans` renders the four
 * price columns as the reason to take the trade, so a row missing any of them
 * is not a setup — it is noise that outranks real ones on score alone.
 */
export function hasTradePlan(r: ScanResult): boolean {
  const l = r.levels;
  return (
    r.pattern !== null &&
    l !== null &&
    [l.entry, l.stopLoss, l.takeProfit1, l.masterProfit].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    )
  );
}

/**
 * What earns a top-up slot: a priced plan, on a continuation shape, breaking in
 * the direction the macro timeframes already read, with the range expansion to
 * carry it. All four, or the row is not what the shortage asked for.
 */
export function isMomentumContinuation(
  r: ScanResult,
  direction: "bullish" | "bearish",
): boolean {
  if (!hasTradePlan(r) || r.direction !== direction || !r.momentumElevated) return false;
  if (r.pattern === null || !CONTINUATION_PATTERNS.has(r.pattern.name)) return false;
  const macro = r.trends.filter((t) => t.timeframe !== "1Hour");
  return macro.filter((t) => t.direction === direction).length >= 2;
}

export interface MarketScanOutput {
  scanDate: string;
  bullish: ScanResult[];
  bearish: ScanResult[];
  universeSize: number;
  shortlisted: number;
  /** How many rows the continuation top-up contributed, per direction. */
  continuationFills: { bullish: number; bearish: number };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Ceiling on top-up scans, so a two-sided shortage can't run past the budget. */
const MAX_TOPUP_SCANS = 24;

export async function runMarketScan(universeTop = 100, perSide = 15): Promise<MarketScanOutput> {
  const scanDate = new Date().toISOString().slice(0, 10);
  const provider = getMarketDataProvider();

  const actives = await resolveUniverse(universeTop);

  // Coarse pass on daily bars only — fetched once, read twice.
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const end = new Date(Date.now() - 16 * 60 * 1000);
  const coarse = await mapWithConcurrency(actives, 8, async (symbol) => {
    try {
      const daily = await provider.fetchBars(symbol, "1Day", yearAgo, end, "us_equity");
      return { reversion: coarseReversion(symbol, daily), continuation: coarseContinuation(symbol, daily) };
    } catch {
      return { reversion: null, continuation: null };
    }
  });

  const byCoarseScore = (a: CoarseCandidate, b: CoarseCandidate) => b.coarseScore - a.coarseScore;
  const shortlist = coarse
    .map((c) => c.reversion)
    .filter((c): c is CoarseCandidate => c !== null)
    .sort(byCoarseScore)
    .slice(0, perSide * 4); // full-scan up to 60 candidates
  const continuationPool = coarse
    .map((c) => c.continuation)
    .filter((c): c is CoarseCandidate => c !== null)
    .sort(byCoarseScore);

  // Full multi-timeframe pass
  const full = await mapWithConcurrency(shortlist, 5, (c) => scanTicker(c.symbol));
  const valid = full.filter((r) => !r.error);

  // The daily lists are trade plans, not a watchlist. A symbol only earns a row
  // when the execution timeframe actually armed a pattern in that direction and
  // the plan priced out — entry, stop, TP1 and master profit all present.
  const rank = (dir: "bullish" | "bearish") =>
    valid
      .filter((r) => r.direction === dir && hasTradePlan(r))
      .sort((a, b) => b.decision.score - a.decision.score)
      .slice(0, perSide);

  const lists: Record<"bullish" | "bearish", ScanResult[]> = {
    bullish: rank("bullish"),
    bearish: rank("bearish"),
  };
  const continuationFills = { bullish: 0, bearish: 0 };

  // ---- Top-up pass: fill a short side with high-momentum continuations.
  const shortfall = {
    bullish: perSide - lists.bullish.length,
    bearish: perSide - lists.bearish.length,
  };
  const totalShortfall = Math.max(shortfall.bullish, 0) + Math.max(shortfall.bearish, 0);

  if (totalShortfall > 0 && continuationPool.length > 0) {
    const published = new Set([...lists.bullish, ...lists.bearish].map((r) => r.symbol));
    const shortSides = (["bullish", "bearish"] as const).filter((d) => shortfall[d] > 0);
    // Split the budget across the short sides so a deep shortfall on one can't
    // consume every scan and leave the other empty.
    const perSideBudget = Math.floor(MAX_TOPUP_SCANS / shortSides.length);
    // A symbol already scanned in the reversion pass told us every pattern it
    // armed. If none of them was a continuation shape in the direction we need,
    // re-scanning it cannot produce one — the preference only reorders the same
    // armed list — so skip it and spend the call on a candidate that might.
    const scanned = new Map(valid.map((r) => [r.symbol, r]));
    const cannotArm = (c: CoarseCandidate): boolean => {
      const prior = scanned.get(c.symbol);
      return (
        prior !== undefined &&
        !prior.armedPatterns.some(
          (p) => p.direction === c.direction && CONTINUATION_PATTERNS.has(p.name),
        )
      );
    };

    const fills = shortSides.flatMap((dir) =>
      continuationPool
        .filter((c) => c.direction === dir && !published.has(c.symbol) && !cannotArm(c))
        // Over-scan the shortfall: not every candidate still arms a trigger on
        // the execution timeframe, and the ones that don't are dropped.
        .slice(0, Math.min(shortfall[dir] * 3, perSideBudget)),
    );

    const scans = await mapWithConcurrency(fills, 5, (c) =>
      scanTicker(c.symbol, undefined, { direction: c.direction, kind: "continuation" }),
    );

    for (const dir of ["bullish", "bearish"] as const) {
      if (shortfall[dir] <= 0) continue;
      const additions = scans
        .filter((r) => !r.error && isMomentumContinuation(r, dir))
        .sort((a, b) => b.decision.score - a.decision.score)
        .slice(0, shortfall[dir]);
      lists[dir] = [...lists[dir], ...additions];
      continuationFills[dir] = additions.length;
    }
  }

  return {
    scanDate,
    bullish: lists.bullish,
    bearish: lists.bearish,
    universeSize: actives.length,
    shortlisted: shortlist.length,
    continuationFills,
  };
}
