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
 * Continuation pass: not solely a shortfall backstop — every run scouts the
 * continuation pool, gated on `hasExceptional4hMomentum` (a genuine range and
 * volume spike in the most recently closed 4-hour bar, not just an ordinary
 * elevated day). A short direction gets topped up to `perSide`; a direction
 * that already filled on reversions alone still gets a small guaranteed
 * allotment appended past `perSide` when the pool has candidates that clear
 * the bar — reversions are scanned first and keep priority, but continuations
 * are no longer something the market only looks for when reversions come up
 * short. A short list is an acceptable outcome; a list padded with symbols
 * that have no trade plan is not.
 */

import type { Bar, ScanResult, SetupKind } from "@/lib/types";
import { fetchAllTimeframesBatch, getMarketDataProvider } from "@/lib/data/provider";
import { fetchMostActives } from "@/lib/data/alpaca";
import { readTrend } from "@/lib/analysis/trend";
import { etDateKey } from "@/lib/market/session";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { CONTINUATION_PATTERNS } from "@/lib/strat/patterns";
import { scanTicker } from "@/lib/scanTicker";
import { MAG7, SECTORS } from "@/lib/sectors";
import {
  FALLBACK_FAN_PCT,
  FALLBACK_HARMONIC_PCT,
  FALLBACK_SR_PCT,
  FAN_PROXIMITY_ATR,
  HARMONIC_PROXIMITY_ATR,
  SR_PROXIMITY_ATR,
  atrPercentOfPrice,
  proximityBandPct,
} from "@/lib/scoring/proximity";

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

/**
 * How much more range/volume than normal counts as "exceptional" over the
 * past 4 hours — deliberately stricter than `MOMENTUM_EXPANSION`, which only
 * asks for a trend that's still expanding. A continuation candidate has to
 * clear both: the trend intact on daily bars, *and* a genuine spike in the
 * most recent 4-hour bar, not just an ordinary elevated day.
 */
export const EXCEPTIONAL_4H_RANGE_MULT = 2;
export const EXCEPTIONAL_4H_VOLUME_MULT = 2;

/** Bars needed before and including the most recent 4-hour candle to judge it. */
const BARS_4H_BASELINE = 20;

/**
 * Whether the most recently closed 4-hour candle shows a genuine volatility
 * *and* volume spike against its own trailing baseline — "the past 4 hours"
 * a continuation candidate is asked to prove itself on. Both have to fire:
 * a wide bar on thin volume is a gap, not participation; heavy volume in a
 * narrow bar is absorption, not a breakout.
 */
export function hasExceptional4hMomentum(bars4h: Bar[]): boolean {
  if (bars4h.length < BARS_4H_BASELINE + 1) return false;
  const last = bars4h[bars4h.length - 1];
  const baseline = bars4h.slice(-(BARS_4H_BASELINE + 1), -1);

  const lastRange = last.h - last.l;
  const baselineRange = mean(baseline.map((b) => b.h - b.l));
  const baselineVolume = mean(baseline.map((b) => b.v));

  if (!(baselineRange > 0) || !(baselineVolume > 0)) return false;
  return (
    lastRange / baselineRange >= EXCEPTIONAL_4H_RANGE_MULT &&
    last.v / baselineVolume >= EXCEPTIONAL_4H_VOLUME_MULT
  );
}

/**
 * How far "extended" means, in multiples of the symbol's own daily ATR —
 * the same re-basing the proximity gates already went through (see
 * lib/scoring/proximity.ts): a flat percent of price does not mean the same
 * thing on a 0.5%-ATR mega-cap as on a 4%-ATR small-cap, so a 1% SPY move
 * and a 15% small-cap move that cover the same number of ATRs now register
 * as equally "extended" instead of the mega-cap almost never qualifying.
 * Tier 2 is double tier 1, preserving the ratio the old 5%/10% pair
 * expressed — re-basing the unit, not covertly re-tuning which tier is
 * stricter.
 */
export const EXTENSION_ATR_TIER1 = 2;
export const EXTENSION_ATR_TIER2 = 4;
/**
 * Fallback fixed-percent thresholds for when no ATR read is available —
 * identical to the values they replace, so a symbol with no volatility read
 * gets exactly the old behavior instead of a silently different one.
 */
export const FALLBACK_EXTENSION_PCT_TIER1 = 5;
export const FALLBACK_EXTENSION_PCT_TIER2 = 10;

function coarseReversion(symbol: string, daily: Bar[]): CoarseCandidate | null {
  if (daily.length < 60) return null;
  const price = daily[daily.length - 1].c;
  const trend = readTrend(daily, "1Day");
  if (trend.direction === "sideways") return null;

  // A reversion candidate moves opposite its current extended trend.
  const direction = trend.direction === "bearish" ? "bullish" : "bearish";

  let score = 0;

  // Every distance below is measured against this symbol's own daily range,
  // not a flat percent of price — see EXTENSION_ATR_TIER1 above for why.
  const atrPct = atrPercentOfPrice(atr(daily.slice(-20), 14), price);

  // Extension: distance of price from its 50-bar mean, in multiples of the
  // symbol's own ATR — more extended, more primed for reversion.
  const mean50 = mean(daily.slice(-50).map((b) => b.c));
  const extensionPct = (Math.abs(price - mean50) / mean50) * 100;
  const tier1Pct = proximityBandPct(EXTENSION_ATR_TIER1, FALLBACK_EXTENSION_PCT_TIER1, atrPct);
  const tier2Pct = proximityBandPct(EXTENSION_ATR_TIER2, FALLBACK_EXTENSION_PCT_TIER2, atrPct);
  if (extensionPct > tier1Pct) score += 1;
  if (extensionPct > tier2Pct) score += 1;

  // Proximity to a Gann fan line or Square-of-9 level — the same ATR-relative
  // bands the full scan's proximity criteria use, so a symbol that clears
  // this coarse gate is likely to clear the real one too.
  const fanBandPct = proximityBandPct(FAN_PROXIMITY_ATR, FALLBACK_FAN_PCT, atrPct);
  const harmonicBandPct = proximityBandPct(HARMONIC_PROXIMITY_ATR, FALLBACK_HARMONIC_PCT, atrPct);
  const fans = computeFanLines(daily, price);
  if (fans.length > 0 && fans[0].distancePct <= fanBandPct) score += 2;
  const majorLow = Math.min(...daily.map((b) => b.l));
  const s9 = squareOf9Levels(majorLow, price);
  if (s9.length > 0 && s9[0].distancePct <= harmonicBandPct) score += 2;

  // Proximity to a clustered S/R level in the reversion direction
  const srBandPct = proximityBandPct(SR_PROXIMITY_ATR, FALLBACK_SR_PCT, atrPct);
  const levels = direction === "bullish" ? trend.support : trend.resistance;
  if (levels.some((l) => (Math.abs(price - l) / price) * 100 <= srBandPct)) score += 2;

  if (score < 3) return null;
  return { symbol, direction, kind: "reversion", coarseScore: score };
}

/**
 * The other side of the same daily bars: a trend that is still running, not one
 * stretched far enough to snap back. Scored on how much momentum is behind it,
 * because that is the whole reason to take a continuation — the gates are hard
 * (an expanding range, price holding the trend side of its mean, and a genuine
 * volatility/volume spike in the past 4 hours — see `hasExceptional4hMomentum`)
 * so the pool stays small and the fills are the ones actually moving right now,
 * not just a name with an elevated day somewhere in its trailing average.
 */
/**
 * Travel-from-mean threshold for the continuation gate, in ATR multiples —
 * scaled down from EXTENSION_ATR_TIER1 by the same ratio the old fixed
 * percentages (3% vs. 5%) expressed, so re-basing the unit doesn't quietly
 * change how strict this gate is relative to the reversion gate.
 */
export const TRAVEL_ATR_MULT = 1.2;
export const FALLBACK_TRAVEL_PCT = 3;

function coarseContinuation(symbol: string, daily: Bar[], bars4h: Bar[]): CoarseCandidate | null {
  // Needs the full trailing window the baseline is measured over.
  if (daily.length < 120) return null;
  if (!hasExceptional4hMomentum(bars4h)) return null;
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

  let score = 3; // cleared the daily expansion gate and the 4-hour spike gate
  if (ratio >= 1.5) score += 1;
  if (ratio >= 2) score += 1;

  // Participation: is the move being funded, or is it drifting on thin tape?
  const volRecent = mean(daily.slice(-10).map((b) => b.v));
  const volBaseline = mean(daily.slice(-60, -10).map((b) => b.v));
  if (volBaseline > 0 && volRecent / volBaseline >= 1.2) score += 1;

  // Distance travelled from the 50-bar mean in the trend direction — a trend
  // that has actually gone somewhere, scored the opposite way to a reversion.
  // Same ATR-relative rebasing as coarseReversion's extension tiers, scaled
  // down to preserve the ratio the old 3%-vs-5% pair expressed.
  const mean50 = mean(daily.slice(-50).map((b) => b.c));
  const travelPct = mean50 > 0 ? ((price - mean50) / mean50) * 100 * (direction === "bullish" ? 1 : -1) : 0;
  const atrPct = atrPercentOfPrice(atr(daily.slice(-20), 14), price);
  const travelBandPct = proximityBandPct(TRAVEL_ATR_MULT, FALLBACK_TRAVEL_PCT, atrPct);
  if (travelPct > travelBandPct) score += 1;

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

/**
 * Minimum continuation slots scouted per side on every run, regardless of
 * whether reversions already filled that side's list to `perSide` — the
 * market is scanned for continuations every run, not only when reversions
 * come up short.
 */
const CONTINUATION_QUOTA_PER_SIDE = 2;

export async function runMarketScan(universeTop = 100, perSide = 15): Promise<MarketScanOutput> {
  // The trading date the scan describes, not the UTC date it happened to run
  // on. The two diverge between 20:00 ET and midnight — a post-close re-run
  // would otherwise be filed under tomorrow, and tomorrow would open showing
  // tonight's levels as though they were current.
  const scanDate = etDateKey(new Date());
  const provider = getMarketDataProvider();

  const actives = await resolveUniverse(universeTop);

  // Coarse pass — daily bars for trend/level context, plus a short window of
  // 4-hour bars so the continuation gate can judge the last 4 hours on their
  // own bar rather than inferring them from the daily candle.
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const recentWeeks = new Date(Date.now() - 15 * 24 * 3600 * 1000);
  const end = new Date(Date.now() - 16 * 60 * 1000);

  // Batched where the provider supports it: one request per timeframe for the
  // whole universe instead of one per symbol. `runMarketScan` scanning 100+
  // symbols individually was the single largest source of outbound requests —
  // enough to blow through both the upstream rate limit and Vercel's function
  // timeout before a scan could finish. Falls back to per-symbol fetches below
  // when unavailable (e.g. the synthetic demo provider).
  const [dailyBatch, bars4hBatch] = await Promise.all([
    provider.fetchBarsBatch?.(actives, "1Day", yearAgo, end, "us_equity") ?? null,
    provider.fetchBarsBatch?.(actives, "4Hour", recentWeeks, end, "us_equity") ?? null,
  ]);

  const coarse = await mapWithConcurrency(actives, 8, async (symbol) => {
    try {
      const [daily, bars4h] =
        dailyBatch && bars4hBatch
          ? [dailyBatch.get(symbol.toUpperCase()) ?? [], bars4hBatch.get(symbol.toUpperCase()) ?? []]
          : await Promise.all([
              provider.fetchBars(symbol, "1Day", yearAgo, end, "us_equity"),
              provider.fetchBars(symbol, "4Hour", recentWeeks, end, "us_equity"),
            ]);
      return {
        reversion: coarseReversion(symbol, daily),
        continuation: coarseContinuation(symbol, daily, bars4h),
      };
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

  // Full multi-timeframe pass — batch-fetch all five timeframes for the whole
  // shortlist up front (five requests total) so each scanTicker call below is
  // just scoring, not a fresh five-request fetch per symbol.
  const shortlistBars = await fetchAllTimeframesBatch(shortlist.map((c) => c.symbol));
  const full = await mapWithConcurrency(shortlist, 5, (c) =>
    scanTicker(c.symbol, undefined, undefined, shortlistBars.get(c.symbol.toUpperCase())),
  );
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

  // ---- Continuation pass: fill a short side, and give every side a small
  // guaranteed allotment even when reversions already filled it — a strong
  // 4-hour spike is worth scouting regardless of whether the reversion list
  // needed help. `shortfall` still reflects the reversion-list gap (kept for
  // `continuationFills` accounting downstream); `target` is what actually
  // drives how many top-up slots each side gets scanned for.
  const shortfall = {
    bullish: perSide - lists.bullish.length,
    bearish: perSide - lists.bearish.length,
  };
  const target = {
    bullish: Math.max(shortfall.bullish, CONTINUATION_QUOTA_PER_SIDE),
    bearish: Math.max(shortfall.bearish, CONTINUATION_QUOTA_PER_SIDE),
  };

  if (continuationPool.length > 0) {
    const published = new Set([...lists.bullish, ...lists.bearish].map((r) => r.symbol));
    const shortSides = (["bullish", "bearish"] as const).filter(
      (d) => target[d] > 0 && continuationPool.some((c) => c.direction === d),
    );
    // Split the budget across the sides being scanned so a deep shortfall on
    // one can't consume every scan and leave the other empty.
    const perSideBudget = Math.floor(MAX_TOPUP_SCANS / Math.max(shortSides.length, 1));
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
        // Over-scan the target: not every candidate still arms a trigger on
        // the execution timeframe, and the ones that don't are dropped.
        .slice(0, Math.min(target[dir] * 3, perSideBudget)),
    );

    const fillBars = await fetchAllTimeframesBatch(fills.map((c) => c.symbol));
    const scans = await mapWithConcurrency(fills, 5, (c) =>
      scanTicker(c.symbol, undefined, { direction: c.direction, kind: "continuation" }, fillBars.get(c.symbol.toUpperCase())),
    );

    for (const dir of ["bullish", "bearish"] as const) {
      if (target[dir] <= 0) continue;
      const additions = scans
        .filter((r) => !r.error && isMomentumContinuation(r, dir))
        .sort((a, b) => b.decision.score - a.decision.score)
        .slice(0, target[dir]);
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
