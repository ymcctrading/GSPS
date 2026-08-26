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
import { MIN_EQUITY_PRICE_USD, meetsLiquidityFloor, readLiquidity } from "@/lib/scan/liquidity";
import { scanTicker } from "@/lib/scanTicker";
import { MAG7, SECTORS } from "@/lib/sectors";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import type { CoarseTelemetryRow } from "@/lib/scan/telemetry";
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
import { envCreds, getAsset } from "@/lib/brokers/alpaca";

/**
 * SEC's own line for a "penny stock" is under $5, and it doubles as a proxy
 * for the wide spreads and thin, unreliable borrow that make this whole
 * price band a bad fit for a bracket-order protocol regardless of how the
 * pattern scores. Distinct from the liquidity/volume gate reverted in
 * 6a34f33 — this is a hard price floor, not a volume coin flip, so it stays.
 *
 * Aliased to the platform-wide floor rather than restated, so the scan's price
 * line and the one every other scan applies cannot drift to two different
 * numbers — see lib/scan/liquidity.ts.
 */
export const MIN_SCAN_PRICE = MIN_EQUITY_PRICE_USD;

/**
 * What the coarse gate is willing to look at, in priority order.
 *
 * The curated sector lists come first — they are the names the product talks
 * about and the ones a user is most likely to recognise on the dashboard — then
 * the large-cap universe behind them, then anything the sector lists contain
 * that the large-cap list does not.
 *
 * This used to be the sector lists alone: about 65 symbols, which is a thin
 * slice of the market to look for a handful of setups in, and thin enough that
 * a quiet day in those 65 names produced an empty dashboard that read as "the
 * market has nothing" rather than "we looked at 65 things". Widening the input
 * does not touch any threshold: the liquidity floor, the coarse momentum gate
 * and the full scan all run afterwards, unchanged.
 */
const FALLBACK_UNIVERSE = Array.from(
  new Set([
    ...MAG7,
    ...Object.values(SECTORS).flatMap((s) => s.symbols),
    ...LARGE_CAP_UNIVERSE,
  ]),
).filter((s) => !s.includes("/"));

async function resolveUniverse(universeTop: number): Promise<string[]> {
  try {
    const actives = await fetchMostActives(universeTop);
    // Union rather than either/or. The screener answers "what is busy today",
    // which is a genuinely different question from "what is large and liquid",
    // and a setup can live in either — a name can be structurally interesting
    // without being one of the day's most active. Actives lead because unusual
    // volume is itself evidence, and the combined list is capped by the caller's
    // budget rather than here.
    if (actives.length > 0) {
      return capUniverse([...actives, ...FALLBACK_UNIVERSE], universeTop);
    }
  } catch {
    /* screener unavailable — fall back to the curated universe */
  }
  return capUniverse(FALLBACK_UNIVERSE, universeTop);
}

/**
 * Hard ceiling on how many symbols reach the coarse pass.
 *
 * The coarse pass batch-fetches bars, so its cost grows in whole requests per
 * ~100 symbols rather than per symbol, and the expensive full pass is bounded
 * separately by the shortlist. That makes a universe this size affordable —
 * but "affordable" is a claim about a 60-second function ceiling that nothing
 * here can prove, and the failure mode is the daily scan timing out and the
 * dashboard going dark for the day.
 *
 * So the ceiling is explicit and deliberately larger than the current universe:
 * growth is fine, silent unbounded growth is not. Raising it means re-checking
 * the scan's wall-clock time against the ceiling in
 * `app/api/market-scan/route.ts` first.
 */
export const MAX_COARSE_UNIVERSE = 750;

/**
 * Apply the caller's budget, then the hard ceiling.
 *
 * `universeTop` was being ignored, which is how a change meant to widen the
 * *available* pool silently widened the *scanned* pool from ≤100 to ~650 inside
 * a 60-second cron. The caller's number is the real budget; MAX_COARSE_UNIVERSE
 * is only a backstop for a caller that asks for something absurd.
 */
function capUniverse(symbols: string[], universeTop: number): string[] {
  const limit = Math.min(Math.max(universeTop, 1), MAX_COARSE_UNIVERSE);
  return Array.from(new Set(symbols)).slice(0, limit);
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

/**
 * The liquidity floor, applied at the top of the coarse pass so it gates both
 * candidate pools from the same read of the same bars. A symbol that cannot be
 * filled cleanly is not a setup on either side — see lib/scan/liquidity.ts.
 * Every universe reaches here: the most-actives screener returns whatever is
 * moving, including sub-$1 names, and the curated fallback is not immune either.
 *
 * This subsumes the `MIN_SCAN_PRICE` check below — the floor enforces the same
 * $5 line — and adds an absolute average-volume minimum on top of it. That is
 * deliberately *not* the relative-volume gate reverted in 6a34f33, which failed
 * a symbol for trading below its own trailing average: half of all symbols do
 * that at any moment, so it was a coin flip that zeroed out AAPL in a quiet
 * week. An absolute floor asks a different question — is there enough tape here
 * to fill a plan at all — and AAPL in its quietest week clears it by two orders
 * of magnitude.
 */
function tradeable(daily: Bar[]): boolean {
  // The market scan's universe is US equities (`resolveUniverse` filters pairs
  // out of the fallback list and the screener returns none).
  return meetsLiquidityFloor(readLiquidity(daily), "us_equity").ok;
}

export function coarseReversion(symbol: string, daily: Bar[]): CoarseCandidate | null {
  if (daily.length < 60) return null;
  if (!tradeable(daily)) return null;
  const price = daily[daily.length - 1].c;
  if (price < MIN_SCAN_PRICE) return null;
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

export function coarseContinuation(symbol: string, daily: Bar[], bars4h: Bar[]): CoarseCandidate | null {
  // Needs the full trailing window the baseline is measured over.
  if (daily.length < 120) return null;
  if (!tradeable(daily)) return null;
  if (!hasExceptional4hMomentum(bars4h)) return null;
  const price = daily[daily.length - 1].c;
  if (price < MIN_SCAN_PRICE) return null;
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

interface CoarseDiagnostics {
  symbol: string;
  /** The underlying daily trend read, or null when sideways/unreadable. Not
   * the same as either gate's candidate direction — a reversion candidate
   * trades against this. */
  trendDirection: "bullish" | "bearish" | null;
  price: number;
  atrPct: number | null;
  extensionPct: number;
  extensionAtr: number | null;
  travelPct: number | null;
  travelAtr: number | null;
}

/**
 * The raw ATR-relative measurements behind both coarse gates, recomputed
 * independently of `coarseReversion`/`coarseContinuation`'s pass/fail logic.
 * Exists purely to log what the gate saw for every symbol it considered —
 * cleared or not — so the ATR-multiple thresholds chosen when the gate was
 * rebased off flat percentages can be calibrated against real outcomes
 * later instead of staying a one-time guess (see `lib/scan/telemetry.ts`).
 * Cheap (same bars already in memory, no extra network calls) and never
 * feeds back into the gates, so instrumenting it can't change scan behavior.
 */
function coarseDiagnostics(symbol: string, daily: Bar[]): CoarseDiagnostics | null {
  if (daily.length < 60) return null;
  const price = daily[daily.length - 1].c;
  const atrPct = atrPercentOfPrice(atr(daily.slice(-20), 14), price) ?? null;
  const mean50 = mean(daily.slice(-50).map((b) => b.c));
  const extensionPct = mean50 > 0 ? (Math.abs(price - mean50) / mean50) * 100 : 0;
  const extensionAtr = atrPct !== null && atrPct > 0 ? extensionPct / atrPct : null;

  const trend = daily.length >= 120 ? readTrend(daily, "1Day") : null;
  let trendDirection: "bullish" | "bearish" | null = null;
  let travelPct: number | null = null;
  let travelAtr: number | null = null;
  if (trend && trend.direction !== "sideways") {
    trendDirection = trend.direction;
    const dir = trend.direction === "bullish" ? 1 : -1;
    travelPct = mean50 > 0 ? ((price - mean50) / mean50) * 100 * dir : 0;
    travelAtr = atrPct !== null && atrPct > 0 ? travelPct / atrPct : null;
  }

  return { symbol, trendDirection, price, atrPct, extensionPct, extensionAtr, travelPct, travelAtr };
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
  /**
   * Of `shortlisted` full-pass scans, how many came back with `.error` set —
   * a provider/data failure, not a symbol that was scanned and found clean.
   * An empty day where this is near `shortlisted` means the feed failed, not
   * that nothing armed; the two look identical in the published lists alone.
   */
  scanErrors: number;
  /** Per-symbol coarse-gate diagnostics for later threshold calibration. */
  coarseTelemetry: CoarseTelemetryRow[];
  /**
   * True when the continuation top-up pass was skipped because the scan was
   * already past its soft time budget — see `CONTINUATION_DEADLINE_MS`. The
   * reversion lists are unaffected either way; this only means continuation
   * fills weren't attempted on a run that was running long.
   */
  continuationSkipped: boolean;
  /**
   * Every symbol that received a full multi-timeframe `scanTicker` pass this
   * run (the reversion shortlist plus any continuation top-up candidates),
   * regardless of whether it made `bullish`/`bearish` — including symbols
   * that armed nothing (`Reject`) or armed no directional pattern
   * (`direction: "none"`). `bullish`/`bearish` only publish the top
   * `perSide` winners; this is the full graded set behind them, needed by
   * any caller that has to distinguish "scanned and found clean" from
   * "never looked at this run" for a symbol it cares about (e.g. deciding
   * whether to invalidate an existing Watch/Execute monitor — see
   * lib/entitlements/scheduled-scan.ts).
   */
  fullScanResults: ScanResult[];
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

/**
 * A "Sell" row means short shares — that is what the order ticket's Protocol
 * Recommended mode puts up first. Alpaca will not borrow every listed name
 * (small caps especially), and a row the broker will reject on submission is
 * not a trade plan, whatever the pattern scored. Checked only for the bearish
 * list; going long never needs a borrow. Unknown/unreachable broker fails
 * open, same direction as the /api/assets preflight the order ticket itself
 * uses — better an occasional non-shortable row than the whole list going
 * dark because the broker call failed.
 */
export async function filterShortable(results: ScanResult[]): Promise<ScanResult[]> {
  const creds = envCreds("paper");
  if (!creds) return results;
  const checked = await mapWithConcurrency(results, 8, async (r) => {
    try {
      const asset = await getAsset(creds, r.symbol);
      return asset.shortable ? r : null;
    } catch {
      return r;
    }
  });
  return checked.filter((r): r is ScanResult => r !== null);
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

/** Full-pass shortlist size, as a multiple of `perSide`. */
const SHORTLIST_MULTIPLE = 4;

/**
 * Soft internal deadline, in ms from the start of the scan, past which the
 * continuation top-up pass is skipped rather than attempted. Batching (see
 * `fetchBarsBatch`/`fetchAllTimeframesBatch`) made a normal run comfortably
 * fit Vercel Hobby's 60s hard ceiling, but a slow day on the upstream feed —
 * a large multi-symbol page taking longer than usual — can still eat enough
 * of the budget that the optional continuation pass is what tips a run over
 * the edge. Left below `maxDuration` in `app/api/market-scan/route.ts` with
 * headroom for `filterShortable` and the Supabase writes the route does
 * after this function returns. The reversion lists (the protocol's primary
 * setup) are already complete by the time this is checked, so skipping the
 * top-up here means publishing what was found instead of the whole run
 * getting killed with nothing persisted.
 */
const CONTINUATION_DEADLINE_MS = 42_000;

/**
 * `universeTop`/`perSide` at full breadth are safe again now that the coarse,
 * full, and continuation passes batch-fetch bars for the whole shortlist in a
 * handful of requests (`fetchBarsBatch` / `fetchAllTimeframesBatch`) instead
 * of one request per symbol per timeframe — the ~700-request version of this
 * scan was what blew through Vercel Hobby's 60s function ceiling, not the
 * universe size itself. See `app/api/market-scan/route.ts` for the ceiling
 * this now comfortably fits inside.
 */
export async function runMarketScan(universeTop = 100, perSide = 15): Promise<MarketScanOutput> {
  const startedAt = Date.now();
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
        diagnostics: coarseDiagnostics(symbol, daily),
      };
    } catch {
      return { reversion: null, continuation: null, diagnostics: null };
    }
  });

  const byCoarseScore = (a: CoarseCandidate, b: CoarseCandidate) => b.coarseScore - a.coarseScore;
  const shortlist = coarse
    .map((c) => c.reversion)
    .filter((c): c is CoarseCandidate => c !== null)
    .sort(byCoarseScore)
    .slice(0, perSide * SHORTLIST_MULTIPLE); // full-scan up to perSide*SHORTLIST_MULTIPLE candidates
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
  const scanErrors = full.length - valid.length;

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

  // Hoisted so the telemetry build below (outside this block) can see which
  // continuation candidates got a real full scan and what score they made.
  let continuationScanResults: ScanResult[] = [];
  let continuationSkipped = false;

  const elapsedBeforeContinuation = Date.now() - startedAt;
  if (elapsedBeforeContinuation >= CONTINUATION_DEADLINE_MS) {
    continuationSkipped = true;
    console.warn(
      `market-scan: ${scanDate} skipping continuation pass — ${elapsedBeforeContinuation}ms ` +
        `elapsed, over the ${CONTINUATION_DEADLINE_MS}ms budget`,
    );
  }

  if (!continuationSkipped && continuationPool.length > 0) {
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
    continuationScanResults = scans;

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

  lists.bearish = await filterShortable(lists.bearish);

  const shortlistedSymbols = new Set(shortlist.map((c) => c.symbol.toUpperCase()));
  const fullScanResults = new Map(
    [...valid, ...continuationScanResults].map((r) => [r.symbol, r]),
  );
  const coarseTelemetry: CoarseTelemetryRow[] = coarse
    .filter((c) => c.diagnostics !== null)
    .map((c) => {
      const d = c.diagnostics!;
      const sym = d.symbol.toUpperCase();
      const fullResult = fullScanResults.get(sym);
      return {
        scan_date: scanDate,
        symbol: sym,
        direction: d.trendDirection,
        price: d.price,
        atr_pct: d.atrPct,
        extension_pct: d.extensionPct,
        extension_atr: d.extensionAtr,
        cleared_reversion: c.reversion !== null,
        reversion_score: c.reversion?.coarseScore ?? null,
        cleared_continuation: c.continuation !== null,
        continuation_score: c.continuation?.coarseScore ?? null,
        travel_pct: d.travelPct,
        travel_atr: d.travelAtr,
        shortlisted: shortlistedSymbols.has(sym),
        full_scan_score: fullResult?.decision.score ?? null,
        full_scan_output_state: fullResult?.decision.outputState ?? null,
      };
    });

  return {
    scanDate,
    bullish: lists.bullish,
    bearish: lists.bearish,
    universeSize: actives.length,
    shortlisted: shortlist.length,
    continuationFills,
    scanErrors,
    coarseTelemetry,
    continuationSkipped,
    fullScanResults: [...fullScanResults.values()],
  };
}
