/**
 * Daily market-wide scan.
 *
 * Coarse pass: pull the most-active US equities and score cheap daily-bar
 * signals once per symbol, producing two candidate pools — reversions (a turn
 * at a Gann level, fan line or time window) and continuations (a trend still
 * expanding, with volume behind it).
 *
 * Full pass: run the complete multi-timeframe scanTicker on the reversion
 * shortlist and keep the top `perSide` per direction.
 *
 * Continuation pass (rewritten 2026-10-16, PLAN.md item 6 step 11): Gann's
 * "a stock is never too high to buy so long as the trend is up, provided you
 * place a stop" (W006 p.22; the mirror for a short, pp.38-39). Every run scans
 * the best-ranked candidates running with their trend, on each side, and they
 * compete with the reversions for the same `perSide` slots by score. The trend
 * alone admits one (`qualifiesAsContinuationFill`): a priced plan running
 * with Gann's weighted trend. The 4-hour spike, range expansion, two-of-three
 * breadth, Execute-score bar and two-slot quota that used to gate it had no
 * source in Gann. The first two ranked the coarse pool for a while after;
 * since 2026-10-16 (item 6, "fix all non Gann gaps") they are gone, and with
 * them the 4-hour fetch.
 *
 * Cycle-timed selection (added 2026-09-25): each symbol's own Gann time
 * cycles now help decide *which* symbols reach a full scan, rather than only
 * annotating symbols a full scan already selected. Two reads, because the
 * two halves of the method need different history:
 *   - Day-count wheel, on the coarse pass's daily bars: a small bonus on
 *     both gates (`CYCLE_WINDOW_BONUS`). No extra fetch.
 *   - Yearly cycles, on ten years of monthly bars: a re-rank of the
 *     reversion pool before the shortlist cut (`YEAR_CYCLE_POOL_MULTIPLE`,
 *     `rankShortlist`). One extra batch fetch, run in parallel with the
 *     daily fetch and never waited on — skipped for the run if it hasn't
 *     landed when the coarse pass finishes.
 * Both rank, neither gates, and both run inside this same scan — no new
 * cron. Each constant's own comment carries its design rationale.
 */

import { mergeSweptIntoShortlist, SWEEP_SLOTS } from "@/lib/scan/universeSweep";
import { CRYPTO_UNIVERSE } from "@/lib/scan/cryptoUniverse";
import { FUND_MARKETS, isFundMarket } from "@/lib/market/otherMarkets";
import type { Bar, ScanResult, SetupKind } from "@/lib/types";
import { fetchAllTimeframesBatch, getMarketDataProvider } from "@/lib/data/provider";
import { fetchMonthlyStored } from "@/lib/data/monthlyStore";
import { listTier } from "@/lib/scan/listOrder";
import { assertLiveMarketData } from "@/lib/data/feed-mode";
import { fetchMostActives } from "@/lib/data/alpaca";
import { readTrend } from "@/lib/analysis/trend";
import { rangeMidpoint } from "@/lib/gann/retracement";
import { etDateKey } from "@/lib/market/session";
import { discoverUniverse, type DiscoveryReading } from "@/lib/scanner/discovery";
import { resolveFeedPolicy } from "@/lib/data/timeliness";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { computeVolumeClimax } from "@/lib/gann/volumeClimax";
import {
  timeCycles,
  yearCycleConvergence,
  type TimeCycleResult,
  type YearCycleConvergence,
} from "@/lib/gann/timeCycles";
import { gannMacroDirection, isWithGannTrend, trendsFromBars } from "@/lib/scan/entrySelection";
import { readHeldLevel } from "@/lib/gann/heldLevel";
import { oldStructuralLevels, type StructuralLevel } from "@/lib/scan/structuralLevels";
import { toWeeklyBars } from "@/lib/gann/disclosedRules";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { pricePoint } from "@/lib/gann/pointScale";
import { MIN_EQUITY_PRICE_USD, meetsLiquidityFloor, readLiquidity } from "@/lib/scan/liquidity";
import { scanTicker } from "@/lib/scanTicker";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { DEFAULT_UNIVERSE_THRESHOLDS, type UniverseThresholds } from "@/lib/universe/eligibility";
import { MAG7, SECTORS } from "@/lib/sectors";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import type { CoarseTelemetryRow } from "@/lib/scan/telemetry";
import {
  atrPercentOfPrice,
  levelBandPct,
} from "@/lib/scoring/proximity";
import { envCreds, getAsset } from "@/lib/brokers/alpaca";
import { isStopBreached } from "@/lib/gann/stopBreach";
import { getMarketDailyBars, getMarketMonthlyBars } from "@/lib/data/marketBenchmark";
import { readLeadership, readWeakStockFrom, selectionStrength, type LeadershipReading, type WeakStockReading } from "@/lib/gann/leadership";
import { readUniverseRank, type UniverseStrength } from "@/lib/gann/universeStrength";
import { getUniverseStrength } from "@/lib/data/universeStrength";
import { ALPACA_PROVIDER_LABEL, inBackgroundLane, tokensLeft, tokensSpentSince, tokensSpentSnapshot } from "@/lib/data/http";

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

/**
 * `extraSymbols` leads every concatenation below — ahead of both the actives
 * screener and the curated fallback — so `capUniverse`'s post-dedup slice
 * can never crowd them out regardless of `universeTop`. See its callers for
 * what actually lands here: the currently-tracked (already-qualified)
 * shortlist and the current universe-rotation discovery chunk, per
 * `lib/scan/universe-rotation.ts` and AGENTS.md's "Cycles as architecture,
 * not only scoring."
 */
export async function resolveUniverse(universeTop: number, extraSymbols: string[] = []): Promise<string[]> {
  try {
    const actives = await fetchMostActives(universeTop);
    // Union rather than either/or. The screener answers "what is busy today",
    // which is a genuinely different question from "what is large and liquid",
    // and a setup can live in either — a name can be structurally interesting
    // without being one of the day's most active. Actives lead because unusual
    // volume is itself evidence, and the combined list is capped by the caller's
    // budget rather than here.
    if (actives.length > 0) {
      return capUniverse([...extraSymbols, ...actives, ...FALLBACK_UNIVERSE], universeTop);
    }
  } catch {
    /* screener unavailable — fall back to the curated universe */
  }
  return capUniverse([...extraSymbols, ...FALLBACK_UNIVERSE], universeTop);
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
 *
 * Raised from 750 to 1000 alongside the large-cap universe refresh that took
 * `LARGE_CAP_UNIVERSE` from ~500 to ~770 names (see
 * lib/scan/large-cap-universe.ts) — the combined fallback pool (MAG7 + sector
 * watchlists + the large-cap list) now sits around 800-820 unique symbols, and
 * 750 would have silently clipped it.
 *
 * This is only a backstop, not a claim that the coarse pass is safe anywhere
 * near it — `runMarketScan`'s own `universeTop` default was pulled back to
 * 250 on 2026-09-22 after a live run at 700 blew the 60s ceiling; see that
 * default's doc comment for the actual measured timing. "Wall-clock cost
 * scales with the slowest chunk's latency, not the chunk count" turned out to
 * be wrong in practice — the coarse fetch scaled visibly with symbol count.
 * Don't raise `universeTop` toward this ceiling without a fresh timed run
 * confirming headroom first.
 */
export const MAX_COARSE_UNIVERSE = 1000;

/**
 * The `universeTop` every full-universe scheduled/cron scan should pass —
 * every call site that exists to cover the whole big-cap universe (not a
 * narrower on-demand or intraday one) uses this constant rather than its own
 * number, so "how wide is a full scan" is answered in one place.
 *
 * Previously every one of these call sites left `universeTop` at
 * `runMarketScan`'s bare default of 100 — which, per `resolveUniverse`
 * below, is a pool of same-day "most actives" (often small, volatile names)
 * unioned with the ~600-symbol `FALLBACK_UNIVERSE` and then capped to 100
 * *before* the union is even sorted by relevance — so on a busy day the
 * actives alone could fill the entire budget and the curated large-cap list
 * was never reached at all. That is the dashboard-vs-manual-scan gap
 * (Buy/Sell setups reading thinner than a manual Scan-tab run over the same
 * universe): both paths score identically, but the scheduled scan was
 * drawing from a much smaller, actives-biased pool.
 *
 * 2026-09-22 CORRECTION: this was set to 700 on the architectural belief that
 * the coarse pass's cost scales with request *chunks*, not `universeTop`
 * directly — untested, and wrong, for a reason findable in the code: chunk
 * requests aren't actually all fired at once. `fetchBarsBatch`'s
 * `CHUNK_CONCURRENCY = 3` (lib/data/alpaca.ts, added the same week to stop
 * an unrelated rate-limit crash) throttles chunks to 3 at a time, and each
 * 100-symbol daily-bar chunk needs multiple sequential pages of its own
 * (100 symbols x ~252 trading days exceeds Alpaca's 10,000-row page limit —
 * see `BATCH_CHUNK`'s comment). 700 symbols is ~7 chunks, i.e. 3 waves; 250
 * is ~3 chunks, one wave — so this doesn't just reduce total work, it
 * removes whole serialized waves.
 *
 * A live production run at 700 confirmed the cost: `POST /api/market-scan`
 * 504'd at Vercel's 60s ceiling. The `[market-scan]` stage breadcrumbs
 * (lib/marketScan.ts's `mark()` calls) from that run: universe resolution
 * 10ms, coarse batch bar fetch **23.1s**, coarse scoring 75ms, full-pass
 * batch bar fetch (only 50 shortlisted symbols) a further **25.9s** — ~49s
 * spent fetching before a single full score was computed, then the timeout
 * with no results persisted. The full pass's own fetch was independently
 * expensive too — partly `fetchAllTimeframesBatch` fetching `1Hour` bars
 * twice under the temporary `EXECUTION_TIMEFRAME=1Hour` override (see
 * AGENTS.md), fixed in lib/data/provider.ts, but that fix alone is unproven
 * sufficient on its own.
 *
 * Pulled back to 250 as a conservative, data-informed interim value — one
 * coarse-fetch wave instead of three, with real margin left even before
 * crediting the dedup fix's savings. Still 2.5x the original 100-symbol
 * default that motivated introducing this
 * constant. **Do not raise this again on architectural reasoning alone** —
 * that produced both this outage and the 700 value it replaced. Raising it
 * needs a fresh live-timed run (the `mark()` breadcrumbs above) confirming
 * actual headroom first.
 *
 * Set well under `MAX_COARSE_UNIVERSE` (1000) — see that constant's own
 * comment on why the coarse pass is affordable at this size (batched
 * fetches, not one request per symbol) and what re-checking a further raise
 * would require.
 */
export const FULL_UNIVERSE_TOP = 250;

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

export interface CoarseCandidate {
  symbol: string;
  direction: "bullish" | "bearish";
  kind: SetupKind;
  coarseScore: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

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

/**
 * Coarse-pass rank bonus when this symbol's own Gann time-cycle projection
 * (`lib/gann/timeCycles.ts`) is inside a turn window matching the
 * candidate's direction — the per-symbol Ch. 7 cycle hierarchy, not
 * the macro/market-wide calendar. Inverts `timeCycles()` from a post-hoc
 * confluence flag (its only role before this — see `scanTicker.ts` and
 * `lib/backtest/replay.ts`, both of which call it only on symbols already
 * selected) into an input to *which* symbols get selected in the first
 * place.
 *
 * What actually fires here: the coarse pass holds one year of daily bars, so
 * every pivot `timeCycles()` can anchor to is under a year old and its
 * 2-60-year anniversaries always land in the future. On this input only the
 * day-count wheel (45/90/120/180/270/360 days from a pivot) can activate.
 * The yearly cycles are read separately, on monthly bars, by
 * `yearCycleConvergence` in the shortlist re-rank below.
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann source: the day-count wheel — the 45/90/180/360 divisions of the
 *    circle read as calendar days from a top or bottom (Ch.7/Ch.13,
 *    `docs/GANN_HISTORICAL_SOURCES.md` A2.1) — as already implemented in
 *    `timeCycles()`, reused unmodified here, not re-derived.
 * 2. Dewey checklist: unchanged from `timeCycles()`'s own standing caveat —
 *    a single symbol's tradeable history rarely contains enough of its own
 *    pivots to show a cycle repeating even twice, so repetition count and
 *    constancy of period stay unproven per symbol. That is exactly why this
 *    is a coarse-pass RANK bonus, not a gate on its own: it can tip a
 *    borderline candidate into the shortlist, never manufacture one with no
 *    other criterion behind it.
 * 3. Hermetic principle: Correspondence/Rhythm — "wheel within a wheel," the
 *    same nested-cycle structure Gann's Square of 9/Square of 144 are
 *    documented as using (`docs/GANN_HISTORICAL_SOURCES.md` Ch.13). A single
 *    stock's own cycle sits nested inside the macro Great Cycle rather than
 *    being a separate mechanism — this bonus is that nesting made concrete
 *    in the coarse gate, not a new technique.
 *
 * Value chosen to move, not decide: the reversion floor is score>=3 across
 * three criteria worth 2 points each plus this bonus (max 7; a fourth,
 * distance from the 50% point, was removed 2026-10-16) — +1 here is worth less than
 * any single existing criterion, so cycle timing can tip a genuinely close
 * call but never substitute for the structural criteria that carry the
 * pass/fail weight. Not yet logged to `coarse_gate_telemetry` / calibrated
 * against real outcomes the way the ATR-relative thresholds were — a
 * deliberately conservative starting value, to revisit once telemetry
 * exists for it.
 */
export const CYCLE_WINDOW_BONUS = 1;

function cycleBonus(direction: "bullish" | "bearish", cycles: TimeCycleResult | undefined): number {
  if (!cycles) return 0;
  const matches = direction === "bullish" ? cycles.bullishActive : cycles.bearishActive;
  return matches ? CYCLE_WINDOW_BONUS : 0;
}

/**
 * The trend the coarse pass reads (PLAN.md item 6 step 7 and the item 6 review,
 * A-TREND-01): Gann reads the main trend from the monthly chart, the weekly
 * next, and the daily only for fast, active stocks (W006 p.19; the weekly is
 * "the best chart for trading purposes", p.46). It is the full scan's own
 * 30/7/1 weighting (`gannMacroDirection`) over the monthly bars when the
 * monthly fetch has landed, the weekly chart rolled from the year of daily
 * bars, and the daily. Without monthly bars the same weighting reads the
 * weekly first and the daily only when the weekly shows no trend. The full
 * scan reads its weekly chart from five years of weekly bars, so the two can
 * still differ where a year of history doesn't show the weekly trend.
 */
export function coarseTrendDirection(daily: Bar[], monthly?: Bar[]): "bullish" | "bearish" | "sideways" {
  return gannMacroDirection(trendsFromBars(daily, monthly)) ?? "sideways";
}

export function coarseReversion(
  symbol: string,
  daily: Bar[],
  cycles?: TimeCycleResult,
  /** Read once per symbol by the caller; computed here when omitted. */
  trendRead?: "bullish" | "bearish" | "sideways",
  /** The coarse pass's clock: completed sessions are those before its New York day. */
  asOf: Date = new Date(),
  /** The symbol's monthly bars once the coarse monthly fetch has landed, for the old levels. */
  monthly: Bar[] = [],
): CoarseCandidate | null {
  if (daily.length < 60) return null;
  if (!tradeable(daily)) return null;
  const price = daily[daily.length - 1].c;
  if (price < MIN_SCAN_PRICE) return null;
  const trendDirection = trendRead ?? coarseTrendDirection(daily);
  // A reversion candidate moves opposite its trend. With no trend the full
  // scan arms the nearer side (`reversionEntry`), so both sides are scored and
  // the better one is kept; the full scan still picks the side it arms.
  const sides: ("bullish" | "bearish")[] =
    trendDirection === "sideways" ? ["bullish", "bearish"] : [trendDirection === "bearish" ? "bullish" : "bearish"];
  // Completed sessions only, as the full scan reads its daily charts.
  const today = etDateKey(asOf);
  const sessions = daily.filter((b) => b.t.slice(0, 10) < today);
  // The old levels the full scan's `historicalSR` reads (`oldStructuralLevels`,
  // the same builder): the weekly and monthly pivots, the percentage levels,
  // the campaign bottoms and the secondary turn. The weekly chart is rolled
  // from the year of sessions (the coarse pass has no weekly fetch), and with
  // no monthly bars yet the monthly pivots and campaign bottoms are absent:
  // both documented gaps of this pre-filter, as in `coarseTrendDirection`.
  const oldLevels = oldStructuralLevels({
    trends: { weekly: readTrend(toWeeklyBars(sessions), "1Week"), monthly: readTrend(monthly, "1Month") },
    charts: { daily: sessions, monthly },
    campaign: buildCampaignLedger(sessions),
    price,
    asOf,
  });
  let best: CoarseCandidate | null = null;
  for (const direction of sides) {
    const score = reversionScore(sessions, price, direction, cycles, asOf, oldLevels);
    if (score >= 3 && (best === null || score > best.coarseScore)) {
      best = { symbol, direction, kind: "reversion", coarseScore: score };
    }
  }
  return best;
}

function reversionScore(
  sessions: Bar[],
  price: number,
  direction: "bullish" | "bearish",
  cycles: TimeCycleResult | undefined,
  asOf: Date,
  oldLevels: StructuralLevel[],
): number {

  let score = 0;

  // Every "at a level" distance below is Gann's 3-point allowance at the
  // price (`levelBandPct`, N#27).

  // How far price has run from its 50% point no longer scores (PLAN.md item 6
  // step 6, A-TREND-09): "a stock is never too high to buy so long as the
  // trend is up, provided you place a stop loss order" (W006 p.22, and the
  // mirror for a short, pp.38-39). Height alone is no reason to trade against
  // the trend; a reversion has to stand on Gann's own criteria below (a fan
  // line, volume at the turn, an old level, a time window).

  // Proximity to a Gann fan line: within Gann's 3-point allowance, the band
  // the full scan's level criteria use (N#27), so a symbol that clears this
  // coarse gate is likely to clear the real one too.
  const fans = computeFanLines(sessions, price);
  if (fans.length > 0 && fans[0].distancePct <= levelBandPct(price)) score += 2;
  // Same anchor convention and rule as the full scan's volumeClimax
  // criterion (lib/scoring/score.ts): Gann's volume rule at the turn, drying
  // up at a normal bottom or a climax in a panic, heavy at a top (parity D1).
  const climaxAnchorKind = direction === "bullish" ? "low" : "high";
  // Completed sessions, as the full scan reads them. The coarse pass has no
  // monthly bars, so the smallest-month-in-years bottom (A-VOLUME-09) is read
  // only by the full scan: a documented live-only gap in this pre-filter.
  const climax = computeVolumeClimax(sessions, undefined, { asOf }).find((r) => r.anchorKind === climaxAnchorKind);
  if (climax?.confirms) score += 2;

  // An old level the last reaction stopped at and held, read as the full
  // scan's `historicalSR` reads it (`heldLevel.ts`; W006 p.20, Rule 3(b)
  // p.46): Gann confirms a level by price acting there, never by nearness
  // (gann-alignment-audit SUS-01, 2026-10-28). Until then this point passed
  // whenever price sat inside the band of any daily level, so the pre-filter
  // picked a different population from the one the full scan passes. The
  // levels are the full scan's old levels, not the daily pivots (review of #511).
  if (readHeldLevel(sessions, oldLevels, price, direction)) score += 2;

  score += cycleBonus(direction, cycles);
  return score;
}

/**
 * The other side of the same daily bars: a trend that is still running.
 * Gann buys a stock however high while its trend is up, with a stop (W006
 * p.22, A-TREND-09), so the trend alone admits a candidate (item 6 step 11).
 * Momentum only ranks: the pool is scanned best first and the full pass is
 * capped, so the score decides which trending names are looked at.
 */

/** Daily bars a continuation candidate needs: the coarse trend read's own minimum. */
export const CONTINUATION_MIN_DAILY_BARS = 60;

export function coarseContinuation(
  symbol: string,
  daily: Bar[],
  cycles?: TimeCycleResult,
  trendRead?: "bullish" | "bearish" | "sideways",
  /** The symbol's monthly bars when their fetch has landed: the longer record the major range is read from. */
  monthly?: Bar[],
): CoarseCandidate | null {
  if (daily.length < CONTINUATION_MIN_DAILY_BARS) return null;
  if (!tradeable(daily)) return null;
  const price = daily[daily.length - 1].c;
  if (price < MIN_SCAN_PRICE) return null;
  const trendDirection = trendRead ?? coarseTrendDirection(daily);
  if (trendDirection === "sideways") return null;

  // A continuation candidate moves WITH its trend.
  const direction = trendDirection;
  const long = direction === "bullish";

  // Ranking from here down: none of it admits or rejects. Every point reads
  // Gann's own tools (the 50% point, volume behind the move, the time cycles).
  // A widening daily range or a 4-hour spike is not among them, so neither
  // ranks here (removed 2026-10-16).
  let score = 3;

  // Gann's strongest points (gann-alignment-audit SUS-02, 2026-10-28). Both
  // read the major range, not a minor swing: "the most important point is the
  // 50% of the extreme range" (*Commodities* p.35; Master Course Ch. 9, PDF
  // 264, the life range first, then the highest price). Until 2026-10-28 these
  // were the 50% points of the last 20 and 50 bars and a travel of 1.2 ATR,
  // figures no book gives. The record is what the scan holds: the monthly bars
  // when they have landed, with the year of sessions.
  const record = monthly && monthly.length > 0 ? [...monthly, ...daily] : daily;
  let high = -Infinity;
  let low = Infinity;
  for (const b of record) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
  }
  if (high > low && low > 0) {
    // Holding a point or more beyond the half-way point of the extreme range
    // is strength ("Strongest Points", *Commodities* p.36; Master Course PDF
    // 266-267); the mirror, a point or more under it, is weakness.
    const half = (high + low) / 2;
    const point = pricePoint(half);
    if (long ? price > half + point : price < half - point) score += 1;
    // Half of the highest price is the next support once the half-way point is
    // broken (*Commodities* p.37; "Best buying point: 50% of the highest
    // price", Master Course PDF 11): a long above it, a short under it.
    if (long ? price > high / 2 : price < high / 2) score += 1;
  }

  // Volume increasing with the trend (Gann's volume rules, W006 Ch. VI): is
  // the move being funded, or drifting on thin tape? The 1.2 is an
  // engineering choice, labelled.
  const volRecent = mean(daily.slice(-10).map((b) => b.v));
  const volBaseline = mean(daily.slice(-60, -10).map((b) => b.v));
  if (volBaseline > 0 && volRecent / volBaseline >= 1.2) score += 1;

  score += cycleBonus(direction, cycles);

  return { symbol, direction, kind: "continuation", coarseScore: score };
}

interface CoarseDiagnostics {
  symbol: string;
  /** The coarse pass's trend read (`coarseTrendDirection`), or null when sideways/unreadable. Not
   * the same as either gate's candidate direction — a reversion candidate
   * trades against this. */
  trendDirection: "bullish" | "bearish" | null;
  price: number;
  atrPct: number | null;
  extensionPct: number;
  extensionAtr: number | null;
  travelPct: number | null;
  travelAtr: number | null;
  /** Whether this symbol's own Gann time-cycle projection is inside a turn
   * window right now, in either direction — see `CYCLE_WINDOW_BONUS`. */
  cycleActive: boolean;
  /** Which direction that window argues, when active; "both" when a low- and
   * a high-anchored window are active at once; null when inactive. */
  cycleDirection: "bullish" | "bearish" | "both" | null;
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
function coarseDiagnostics(
  symbol: string,
  daily: Bar[],
  cycles?: TimeCycleResult,
  trendRead?: "bullish" | "bearish" | "sideways",
): CoarseDiagnostics | null {
  if (daily.length < 60) return null;
  const price = daily[daily.length - 1].c;
  const atrPct = atrPercentOfPrice(atr(daily.slice(-20), 14), price) ?? null;
  // Same balance point as the gates above (Gann's 50% of range).
  const mid50 = rangeMidpoint(daily.slice(-50));
  const extensionPct = mid50 ? (Math.abs(price - mid50) / mid50) * 100 : 0;
  const extensionAtr = atrPct !== null && atrPct > 0 ? extensionPct / atrPct : null;

  const read = daily.length >= 120 ? (trendRead ?? coarseTrendDirection(daily)) : "sideways";
  let trendDirection: "bullish" | "bearish" | null = null;
  let travelPct: number | null = null;
  let travelAtr: number | null = null;
  if (read !== "sideways") {
    trendDirection = read;
    const dir = read === "bullish" ? 1 : -1;
    travelPct = mid50 ? ((price - mid50) / mid50) * 100 * dir : 0;
    travelAtr = atrPct !== null && atrPct > 0 ? travelPct / atrPct : null;
  }

  const cycleActive = cycles?.active ?? false;
  const cycleDirection: "bullish" | "bearish" | "both" | null = !cycles
    ? null
    : cycles.bullishActive && cycles.bearishActive
      ? "both"
      : cycles.bullishActive
        ? "bullish"
        : cycles.bearishActive
          ? "bearish"
          : null;

  return {
    symbol,
    trendDirection,
    price,
    atrPct,
    extensionPct,
    extensionAtr,
    travelPct,
    travelAtr,
    cycleActive,
    cycleDirection,
  };
}

/**
 * A scan result is publishable to the daily lists only when it carries a
 * complete, finite trade plan. Every consumer of `daily_scans` renders the four
 * price columns as the reason to take the trade, so a row missing any of them
 * is not a setup — it is noise that outranks real ones on score alone.
 */
export function hasTradePlan(r: ScanResult): boolean {
  const l = r.levels;
  // The plan's levels come only from Gann's entry trigger (scanTicker), so a
  // complete plan is the whole test. The STRAT pattern no longer gates
  // publication (2026-09-28, project owner; see AGENTS.md).
  // A plan whose own stop is broken is retired (owner, 2026-09-30, "a breach
  // retires the plan") and never takes a slot: the scan reports it
  // (`stopBreach`), and the price it ran at is checked against the stop
  // directly as well. Production published 11 of 14 such plans on 2026-10-16.
  return (
    l !== null &&
    [l.entry, l.stopLoss, l.takeProfit1, l.masterProfit].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    ) &&
    // A plan whose own stop the scan found broken is retired, not a plan
    // (owner decision 2026-09-30, `lib/gann/stopBreach.ts`): "the plan leaves
    // the lists". Until 2026-10-16 the scan marked it Reject but still published
    // it, so most published rows were dead on arrival (11 of 14 that morning)
    // and the dashboard read them as setups. The price the scan ran at is
    // checked against the stop directly as well.
    !r.stopBreach &&
    !(r.direction !== "none" && isStopBreached(r.direction, l.stopLoss, r.currentPrice))
  );
}

/**
 * A with-trend setup the continuation pass can publish: a priced plan, in the
 * direction asked, running with Gann's weighted trend over the monthly,
 * weekly and daily charts (`isWithGannTrend`, shared with the replay). The
 * trend alone, as Gann buys (W006 p.22): no momentum, breadth or score bar.
 */
export function isWithTrendContinuation(
  r: ScanResult,
  direction: "bullish" | "bearish",
): boolean {
  return hasTradePlan(r) && r.direction === direction && isWithGannTrend(r.trends, direction);
}

/**
 * The continuation pass's admission test. It competes with the reversions for
 * the list's slots by score, so no score bar applies here (the Execute bar it
 * carried until 2026-10-16 rationed with-trend setups only).
 */
export function qualifiesAsContinuationFill(
  r: ScanResult,
  direction: "bullish" | "bearish",
): boolean {
  return isWithTrendContinuation(r, direction);
}

/**
 * One side's list after the continuation pass: the reversions and the
 * admitted with-trend setups ranked together (`compareForList`), the top `perSide`
 * kept (item 6 step 11). On a tie the reversion already listed stays ahead.
 * `added` counts the continuation rows that made the list.
 */
export function mergeContinuations(
  list: ScanResult[],
  scans: ScanResult[],
  direction: "bullish" | "bearish",
  perSide: number,
): { list: ScanResult[]; added: number } {
  // A symbol already on this list is not listed twice (item 7 review M3).
  const onList = new Set(list.map((r) => r.symbol));
  const qualifying = scans.filter((r) => !r.error && qualifiesAsContinuationFill(r, direction) && !onList.has(r.symbol));
  const merged = [...list, ...qualifying].sort(compareForList).slice(0, perSide);
  return { list: merged, added: merged.filter((r) => qualifying.includes(r)).length };
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
   * False when the full pass's stock bars missed `FULL_PASS_FETCH_DEADLINE_MS`
   * and no stock was scored. The lists may still hold crypto and fund rows;
   * publishing them would overwrite and prune the day's stock rows, so the
   * callers (`app/api/market-scan`, `lib/entitlements/scheduled-scan.ts`)
   * publish nothing (`publishRefusal`).
   */
  equitiesRead: boolean;
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
  /**
   * Every stock read of the full pass, the reversion and continuation passes
   * each kept (`fullScanResults` keeps one per symbol), errors included, so
   * the night's sweep rows can be checked against each read
   * (`retireOverruledSweepRows`, SUS-21).
   */
  stockReads: ScanResult[];
  /**
   * Discoveries (`lib/scanner/discovery.ts`): stocks the session has made
   * active, most worth examining first. The route stores them in the
   * evaluation ledger, where the intraday queue takes them as candidates to
   * examine. Never read by the lists, a score, a plan or an order; empty when
   * the coarse daily batch was not read.
   */
  discoveries: DiscoveryReading[];
}

/**
 * Every chart of a short list scored in full, with no coarse filter: the crypto
 * pairs (`lib/scan/cryptoUniverse.ts`) and the commodity and currency funds
 * (`lib/market/otherMarkets.ts`). One batched bar request a timeframe for the
 * list, then `scanTicker`, as the equity full pass does. A symbol the batch
 * missed is fetched by `scanTicker` itself; a failed scan is an error row.
 */
export async function scanEveryChart(
  symbols: readonly string[],
  assetClass: "crypto" | "us_equity",
  universeThresholds: UniverseThresholds = DEFAULT_UNIVERSE_THRESHOLDS,
  scan: typeof scanTicker = scanTicker,
): Promise<ScanResult[]> {
  if (symbols.length === 0) return [];
  const [bars, prices] = await Promise.all([
    fetchAllTimeframesBatch([...symbols], EXECUTION_TIMEFRAME, assetClass),
    latestPrices(symbols, assetClass),
  ]);
  return mapWithConcurrency([...symbols], 4, (symbol) =>
    scan(
      symbol,
      undefined,
      undefined,
      bars.get(symbol.toUpperCase()),
      universeThresholds,
      prices.get(symbol.toUpperCase()),
    ).catch(
      (err: unknown) => ({ symbol, error: String(err) }) as ScanResult,
    ),
  );
}

/**
 * The latest prices of `symbols` in one batched read (`fetchLatestPrices`), so
 * the scans that follow spend no rate-limit token each on their price: the
 * full pass's 56 single reads queued behind the shared limiter until the run
 * passed its 60 s budget (2026-10-22, 19:45-20:15 UTC). Empty when the provider
 * has no batch form or the read fails; `scanTicker` then reads a missing
 * symbol's price itself, as it always did.
 */
export async function latestPrices(
  symbols: readonly string[],
  assetClass: "crypto" | "us_equity",
): Promise<Map<string, number>> {
  const provider = getMarketDataProvider();
  if (!provider.fetchLatestPrices || symbols.length === 0) return new Map();
  return provider.fetchLatestPrices([...symbols], assetClass).catch((err: unknown) => {
    console.warn(`market-scan: batched ${assetClass} latest prices failed, read one by one — ${String(err)}`);
    return new Map<string, number>();
  });
}

/** The commodity and currency funds' setups with a priced plan, each side in the lists' own order. */
export function fundLists(scans: readonly ScanResult[]): Record<"bullish" | "bearish", ScanResult[]> {
  const side = (dir: "bullish" | "bearish") =>
    scans.filter((r) => !r.error && r.direction === dir && hasTradePlan(r)).sort(compareForList);
  return { bullish: side("bullish"), bearish: side("bearish") };
}

/** The crypto pairs' buy setups with a priced plan, in the lists' own order. */
export function cryptoBuyList(scans: readonly ScanResult[]): ScanResult[] {
  return scans.filter((r) => !r.error && r.direction === "bullish" && hasTradePlan(r)).sort(compareForList);
}

/**
 * The stock universe: the actives and tracked symbols less the funds and the
 * crypto pairs, which their own passes score, so none is scored twice. A pair
 * tracked from the joined lists reached the stock fetch on 2026-10-22, and the
 * stock bars endpoint refused the whole batch ("invalid symbol: BCH/USD").
 */
export function stocksOnly(symbols: readonly string[]): string[] {
  return symbols.filter((s) => !isFundMarket(s) && !s.includes("/"));
}

/**
 * The other markets' setups joined to the stock lists, in the lists' own
 * order (`compareForList`, so an Execute pair or fund ranks above a Watch
 * stock), beside the stocks' slots rather than in them. Spot crypto can't be
 * shorted, so its sells are left out (`cryptoUniverse.ts`); a fund's short is
 * checked for a borrow as a stock's is, inside the same `deadline`, and a
 * borrow read still running then lists no fund short (never an unchecked one).
 */
export async function joinOtherMarkets(
  lists: Record<"bullish" | "bearish", ScanResult[]>,
  cryptoScans: readonly ScanResult[],
  fundScans: readonly ScanResult[],
  deadline: number,
  shortable: (ranked: ScanResult[], n: number) => Promise<ScanResult[]> = takeShortable,
): Promise<Record<"bullish" | "bearish", ScanResult[]>> {
  const funds = fundLists(fundScans);
  const fundShorts =
    funds.bearish.length === 0 ? [] : ((await settleBy(shortable(funds.bearish, funds.bearish.length), deadline)) ?? []);
  return {
    bullish: [...lists.bullish, ...cryptoBuyList(cryptoScans), ...funds.bullish].sort(compareForList),
    bearish: [...lists.bearish, ...fundShorts].sort(compareForList),
  };
}

/**
 * `p`'s value if it settles by `deadline` (ms since the epoch), else null, so a
 * slow side pass never holds the scan past its budget.
 */
export async function settleBy<T>(p: Promise<T>, deadline: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    clearTimeout(timer);
  }
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

/**
 * The symbols already on a list, so the continuation pass doesn't re-scan
 * them. The sell side is kept whole until its shortable cut, so only its top
 * `perSide` rows count: a low-ranked short that will never publish must not
 * block its own symbol's with-the-trend buy scan (item 6 second review F5).
 */
export function listedSymbols(lists: Record<"bullish" | "bearish", ScanResult[]>, perSide: number): Set<string> {
  return new Set([...lists.bullish, ...lists.bearish.slice(0, perSide)].map((r) => r.symbol));
}

/**
 * The symbols each side's continuation pass skips: everything `listedSymbols`
 * counts, and for the sell side every row already on the sell list too, so a
 * low-ranked short is not scanned and listed a second time (item 7 review M3).
 */
export function continuationExclusions(
  lists: Record<"bullish" | "bearish", ScanResult[]>,
  perSide: number,
): Record<"bullish" | "bearish", Set<string>> {
  const published = listedSymbols(lists, perSide);
  return { bullish: published, bearish: new Set([...published, ...lists.bearish.map((r) => r.symbol)]) };
}

/**
 * A symbol is on one list only. A with-the-trend buy can be listed for a
 * symbol whose short ranked too low to publish (F5); its sell row then goes,
 * so the cut after the shortable check can't bring it back (item 7 review M3).
 */
export function dropSellsAlsoBought(lists: Record<"bullish" | "bearish", ScanResult[]>): ScanResult[] {
  const bought = new Set(lists.bullish.map((r) => r.symbol));
  return lists.bearish.filter((r) => !bought.has(r.symbol));
}

/**
 * The best `n` rows the broker reports as shortable, in their ranked order.
 * The list is cut only after the check (item 6 review R5), so a short that
 * can't be borrowed never pushes a shortable one off the list. Checks a chunk
 * of `n` at a time, so a list that is all shortable costs no more lookups than
 * `filterShortable` on the cut list did.
 */
export async function takeShortable(ranked: ScanResult[], n: number): Promise<ScanResult[]> {
  const kept: ScanResult[] = [];
  for (let i = 0; i < ranked.length && kept.length < n; i += n) {
    kept.push(...(await filterShortable(ranked.slice(i, i + n))));
  }
  return kept.slice(0, n);
}

/**
 * Ceiling on the continuation pass's full scans a run, split across the sides
 * (item 6 review R4). Since item 6 step 11 the trend alone admits a candidate,
 * so the pool is rarely short of names and the pass spends its whole budget
 * every run, where it used to spend nothing (production's continuation gate
 * admitted no symbol from 2026-09-23 to 2026-10-16). 12 is the scans a run
 * typically made when the top-up did fire. Estimated, not measured by stage
 * (Hobby keeps runtime logs an hour): fast production runs finish the whole
 * scan, 13-24 full scans included, in 7-13 s, so about 0.3-0.5 s a scan, or
 * 4-6 s for 12. The "continuation pass scoring done" mark logs the real figure.
 */
const MAX_TOPUP_SCANS = 12;

/** Full-pass shortlist size, as a multiple of `perSide`. */
const SHORTLIST_MULTIPLE = 4;

/**
 * Shortlist re-rank on each candidate's own yearly Gann cycles
 * (`yearCycleConvergence`, monthly bars). The pool re-ranked is this multiple
 * of the shortlist size, so a candidate with converging cycles can climb in
 * from just below the coarse cut — without it the re-rank could only reorder
 * symbols that were getting a full scan anyway, which changes nothing.
 *
 * Only reversion candidates that already cleared the coarse gate enter the
 * pool, so this never admits a symbol the structural criteria rejected; it
 * decides which qualified ones get the limited full-scan slots.
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann source: Ch. 7's yearly cycles (the "Forecasting" lesson)
 *    (`docs/GANN_HISTORICAL_SOURCES.md` A2.1), counted as convergence the way
 *    his own worked DJIA example counts elapsed time against several anchors
 *    at once.
 * 2. Dewey checklist: per symbol, repetition count and constancy of period
 *    are unproven (ten years of monthly history holds few major pivots), so
 *    this ranks and never gates. It is logged to `coarse_gate_telemetry` so
 *    whether cycle-ranked names outscore their neighbours in the full pass
 *    can be measured rather than assumed.
 * 3. Hermetic principle: Correspondence — the same cycle arithmetic run on
 *    the market as a whole, run on each stock's own history.
 *
 * The numbers (pool multiple, +1 per hit, cap of 2) are engineering choices,
 * not sourced: the cap equals the heaviest single coarse criterion, so cycle
 * timing can outrank one structural point but not several.
 */
export const YEAR_CYCLE_POOL_MULTIPLE = 2;
export const YEAR_CYCLE_HIT_BONUS = 1;
export const YEAR_CYCLE_BONUS_CAP = 2;

function yearCycleBonus(c: CoarseCandidate, hits: YearCycleConvergence | undefined): number {
  if (!hits) return 0;
  const n = c.direction === "bullish" ? hits.bullishHits : hits.bearishHits;
  return Math.min(n * YEAR_CYCLE_HIT_BONUS, YEAR_CYCLE_BONUS_CAP);
}

/**
 * Cut `pool` (already in coarse-score order) to `size`, ranking by coarse
 * score plus the yearly-cycle bonus. With no cycle reads it is exactly the
 * old top-`size` slice. Ties keep coarse order.
 */
export function rankShortlist(
  pool: CoarseCandidate[],
  size: number,
  yearHits: Map<string, YearCycleConvergence> | null,
  /**
   * Each symbol's selection strength by direction (`selectionStrength`):
   * Gann's early leaders take the full-scan slots first (A-SELECTION-02).
   */
  strength: Map<string, (direction: "bullish" | "bearish") => number> | null = null,
): CoarseCandidate[] {
  if (!yearHits && !strength) return pool.slice(0, size);
  return pool
    .map((c, i) => {
      const sym = c.symbol.toUpperCase();
      return { c, i, lead: strength?.get(sym)?.(c.direction) ?? 0, rank: c.coarseScore + yearCycleBonus(c, yearHits?.get(sym)) };
    })
    .sort((a, b) => b.lead - a.lead || b.rank - a.rank || a.i - b.i)
    .slice(0, size)
    .map((x) => x.c);
}

/**
 * The daily lists' order (A-SELECTION-02): Gann buys the early leaders first,
 * so among setups with the same verdict the one his selection rules favour
 * (`ScanResult.selectionStrength`) comes first, then the higher score. The
 * verdict comes before both, so a held or rejected leader never takes an
 * actionable setup's place: Gann picks his leaders from the stocks giving a
 * signal. Before 2026-10-16 the lists sorted on score alone, so a held Watch
 * could outrank an Execute; it no longer can.
 */
export function compareForList(a: ScanResult, b: ScanResult): number {
  return (
    listTier(b) - listTier(a) ||
    (b.selectionStrength ?? 0) - (a.selectionStrength ?? 0) ||
    b.decision.score - a.decision.score
  );
}

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
 * Past this, in ms from the start of the scan, the full pass stops waiting for
 * its shortlist's bars. On 2026-10-22, 27 scheduled scan calls from 12:57 to
 * 18:45 UTC ran into the 60 s limit (pg_net's `_http_response`); at 18:45 the
 * fetch alone ran from +18 s to +48 s and the run was killed at 60 s. Scoring
 * the shortlist takes about 2 s (18:03, +48.1 s to +50.1 s), so 40 s leaves the
 * scoring, the shortable read, the other markets' join and the route's writes
 * the rest of the budget. An engineering figure, as the continuation deadline
 * is.
 */
const FULL_PASS_FETCH_DEADLINE_MS = 40_000;

/** The continuation pass's own bar fetch stops being waited for here (see above). */
const CONTINUATION_FETCH_DEADLINE_MS = 48_000;

/**
 * `universeTop` defaults to `FULL_UNIVERSE_TOP` — see that constant's own
 * comment for the full history (including the 2026-09-22 production timeout
 * that corrected it from an untested 700/900 down to a measured-safe 250).
 * A bare literal here, independent of `FULL_UNIVERSE_TOP`, is exactly how
 * this drifted out of sync with reality before: every real caller
 * (`app/api/market-scan/route.ts`, `lib/entitlements/scheduled-scan.ts`)
 * already passes `FULL_UNIVERSE_TOP` explicitly, so this default only
 * matters to a caller that doesn't — and it should never quietly diverge
 * from the number those callers use.
 */
export async function runMarketScan(
  universeTop = FULL_UNIVERSE_TOP,
  perSide = 15,
  /**
   * `getUniversePolicy()`-resolved Market Universe thresholds, resolved once
   * by the caller (e.g. `app/api/market-scan/route.ts`) rather than per
   * symbol — see lib/universe/policy.ts's module doc. Defaults to the code
   * constants, so every existing caller is unaffected.
   */
  universeThresholds: UniverseThresholds = DEFAULT_UNIVERSE_THRESHOLDS,
  /**
   * Symbols this run must include regardless of what the actives screener
   * returns — see `resolveUniverse`'s own comment. Defaults to empty, so
   * every existing caller is unaffected; `app/api/market-scan/route.ts` is
   * the one caller that resolves and passes this (the currently-tracked
   * shortlist union the current universe-rotation discovery chunk).
   */
  extraSymbols: string[] = [],
  /**
   * Last night's swept Execute and Watch setups (`lib/scan/universeSweep.ts`,
   * `loadSweptCandidates`), best first. They take the full pass's first slots
   * whatever the coarse filter reads, so a stock the sweep scored Execute is
   * re-scored on today's price instead of never being looked at; the coarse
   * shortlist fills the rest, so the full pass scores no more symbols than
   * before. Defaults to empty, the coarse shortlist alone.
   */
  sweptSymbols: string[] = [],
): Promise<MarketScanOutput> {
  const startedAt = Date.now();
  // Temporary stage-timing breadcrumbs (2026-09-10) while the widened
  // universeTop default (see this function's own doc comment above) is
  // unverified against Vercel's 60s ceiling — a 504 kills the response
  // before any JSON gets returned, so these are logged as each stage
  // finishes rather than only reported at the end. Remove once the budget
  // is confirmed safe on a live run, or replace with real telemetry.
  const mark = (stage: string, extra?: string) =>
    console.log(`[market-scan] ${stage} at +${Date.now() - startedAt}ms${extra ? ` (${extra})` : ""}`);

  // The trading date the scan describes, not the UTC date it happened to run
  // on. The two diverge between 20:00 ET and midnight — a post-close re-run
  // would otherwise be filed under tomorrow, and tomorrow would open showing
  // tonight's levels as though they were current.
  // The rate-limit tokens this run spends, by endpoint, logged at the end.
  const tokensBefore = tokensSpentSnapshot();
  const scanDate = etDateKey(new Date());
  const provider = getMarketDataProvider();
  // Never publish setups priced from the synthetic walk (both callers fail
  // closed on a throw: the route returns 502, the scheduled scan 503).
  assertLiveMarketData("run the market scan", provider);

  // The market's (SPY's) daily and monthly bars, for Gann's early leaders in
  // the shortlist cut (A-SELECTION-02). Read once a day and cached, and every
  // full scan reads them anyway, so starting them here, alongside the
  // universe and daily fetches, adds no request and no wait.
  // A read that fails, however it fails, leaves the leadership reading unread.
  const marketBarsP = Promise.resolve()
    .then(() => Promise.all([getMarketDailyBars(), getMarketMonthlyBars()]))
    .catch(() => [null, null] as const);
  // The scan universe's monthly bars for Gann's relative strength rank (S6),
  // read once a day and cached; the shortlisted scans read it in full. The
  // shortlist cut uses it only if it has landed by then, never waited on.
  let universeAtCoarse: UniverseStrength | null | undefined = undefined;
  const universeStarted = Date.now();
  void getUniverseStrength().then((u) => {
    universeAtCoarse = u;
    mark("universe strength read", u ? `${u.size} months in ${Date.now() - universeStarted}ms` : "unread");
  });

  // The markets besides stocks, every chart scored in full: the crypto pairs
  // (`lib/scan/cryptoUniverse.ts`) and the commodity and currency funds
  // (`lib/market/otherMarkets.ts`), started now so they run beside the equity
  // passes rather than after them. A failure leaves that market's rows off
  // this run and nothing else.
  const sidePass = (name: string, p: Promise<ScanResult[]>) =>
    p
      .then((r) => {
        mark(`${name} pass done`, `${r.length} symbols`);
        return r;
      })
      .catch((err: unknown) => {
        console.warn(`market-scan: ${name} pass failed:`, String(err));
        return [] as ScanResult[];
      });
  // Both in the background lane (`lib/data/http.ts`): their reads take a
  // rate-limit token only while the stocks' full pass keeps its reserve.
  const cryptoP = sidePass("crypto", inBackgroundLane(() => scanEveryChart(CRYPTO_UNIVERSE, "crypto", universeThresholds)));
  const fundsP = sidePass("funds", inBackgroundLane(() => scanEveryChart(FUND_MARKETS, "us_equity", universeThresholds)));

  // A fund or pair named here is scored by its own pass, never by the stocks'.
  const actives = stocksOnly(await resolveUniverse(universeTop, stocksOnly(extraSymbols)));
  mark("resolveUniverse done", `${actives.length} symbols`);

  // Coarse pass: daily bars for trend/level context.
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const end = new Date(Date.now() - 16 * 60 * 1000);

  // Batched where the provider supports it: one request per timeframe for the
  // whole universe instead of one per symbol. `runMarketScan` scanning 100+
  // symbols individually was the single largest source of outbound requests —
  // enough to blow through both the upstream rate limit and Vercel's function
  // timeout before a scan could finish. Falls back to per-symbol fetches below
  // when unavailable (e.g. the synthetic demo provider).
  // Monthly bars for the yearly-cycle re-rank, started alongside the daily
  // fetch rather than after it, so it adds no wall-clock time: it
  // is under half the daily fetch's rows and runs while the daily fetch (the
  // long pole — 21.4s at 250 symbols, production 2026-09-25) is still going.
  // Never awaited past that point: if it hasn't landed by the time the coarse
  // pass needs it, the re-rank is skipped for this run rather than waited on.
  // See AGENTS.md's "Speed is a product requirement".
  let monthlyBatch: Map<string, Bar[]> | null | undefined = undefined;
  if (provider.fetchBarsBatch) {
    const monthlyStarted = Date.now();
    const tenYearsAgo = new Date(Date.now() - 10 * 365.25 * 24 * 3600 * 1000);
    // Background lane: never waited on, so it must not take the tokens the
    // full pass waits on (2026-10-23: 37 pages for 250 symbols).
    // Closed months come from the month's store (`monthlyStore.ts`); only the
    // last two are read live (39 pages before, 2026-10-23 10:30 UTC).
    const batch = provider.fetchBarsBatch.bind(provider);
    void inBackgroundLane(() =>
      provider.isLive
        ? fetchMonthlyStored(batch, actives, tenYearsAgo, end)
        : batch(actives, "1Month", tenYearsAgo, end, "us_equity"),
    )
      .then((m) => {
        monthlyBatch = m;
        mark("monthly batch fetch done", `${m.size} symbols in ${Date.now() - monthlyStarted}ms`);
      })
      .catch((err) => {
        monthlyBatch = null;
        console.warn(`market-scan: ${scanDate} monthly fetch failed, yearly-cycle re-rank skipped — ${String(err)}`);
      });
  }

  const dailyBatch = (await provider.fetchBarsBatch?.(actives, "1Day", yearAgo, end, "us_equity")) ?? null;
  mark("coarse batch bar fetch done", `daily=${dailyBatch?.size ?? "n/a"}`);

  // The monthly bars, when their fetch has landed by now (it normally has: it
  // is under half the daily fetch's rows and starts with it), give the coarse
  // trend read its main trend. Not waited on: without them the read falls back
  // to the weekly and daily charts.
  const monthlyAtCoarse = monthlyBatch as Map<string, Bar[]> | null | undefined;
  mark("monthly bars at the coarse pass", monthlyAtCoarse ? `${monthlyAtCoarse.size} symbols` : "not in");
  const [marketDaily, marketMonthly] = await marketBarsP;
  mark("market bars for leadership", marketDaily ? `${marketDaily.length} days` : "none");
  const universeStrength = universeAtCoarse as UniverseStrength | null | undefined;
  mark("universe strength at the coarse pass", universeStrength ? `${universeStrength.size} months` : "not in");
  const coarseAsOf = new Date();
  const coarse = await mapWithConcurrency(actives, 8, async (symbol) => {
    try {
      const daily = dailyBatch
        ? (dailyBatch.get(symbol.toUpperCase()) ?? [])
        : await provider.fetchBars(symbol, "1Day", yearAgo, end, "us_equity");
      // Computed once per symbol and threaded into both gates plus
      // diagnostics — cheap (pure arithmetic over bars already in memory
      // from the batch fetch above), no extra network call. See
      // `CYCLE_WINDOW_BONUS`'s own comment for what this does and doesn't
      // claim.
      const cycles = timeCycles(daily);
      // One trend read per symbol, shared by both gates and the telemetry.
      const monthly = monthlyAtCoarse?.get(symbol.toUpperCase());
      const trendRead = daily.length >= 60 ? coarseTrendDirection(daily, monthly) : "sideways";
      const reversion = coarseReversion(symbol, daily, cycles, trendRead, coarseAsOf, monthly ?? []);
      // Gann's early leaders (A-SELECTION-02/-03), read only for the candidates
      // the shortlist cut ranks: a few array scans over bars already here.
      const leadership: LeadershipReading | null = reversion
        ? readLeadership(daily, marketDaily, undefined, { stock: monthly, market: marketMonthly })
        : null;
      // And Gann's weak stocks (A-SELECTION-04), on the monthly bars when
      // they are in.
      const weak: WeakStockReading | null = reversion ? readWeakStockFrom(monthly, daily, marketMonthly, marketDaily) : null;
      // And its rank among the universe (S6), when the universe's months are in.
      const rank = reversion && universeStrength ? readUniverseRank(symbol, monthly ?? null, coarseAsOf, universeStrength) : null;
      return {
        leadership,
        weak,
        rank,
        reversion,
        continuation: coarseContinuation(symbol, daily, cycles, trendRead, monthly),
        diagnostics: coarseDiagnostics(symbol, daily, cycles, trendRead),
      };
    } catch {
      return { leadership: null, weak: null, rank: null, reversion: null, continuation: null, diagnostics: null };
    }
  });
  mark("coarse scoring done");
  // Discovery (`lib/scanner/discovery.ts`): which stocks the session has
  // made active, read from the daily bars the coarse pass already holds,
  // observed through the fetch's end (now less the feed's delay). Nothing
  // below reads it; the route stores it for the intraday queue.
  let discoveries: DiscoveryReading[] = [];
  if (dailyBatch) {
    const discoveryStarted = Date.now();
    const delayMs = resolveFeedPolicy({ assetClass: "us_equity", isLive: true, source: "alpaca", env: process.env }).contractualDelayMs;
    const evaluatedAt = new Date();
    // The fetch ended at `end`; with no feed delay the session is observed through that end too.
    const observedThrough = new Date(Math.min(end.getTime(), evaluatedAt.getTime() - delayMs));
    discoveries = discoverUniverse(dailyBatch, { evaluatedAt, observedThrough, delayMs });
    mark("discovery", `${discoveries.length} stocks in ${Date.now() - discoveryStarted}ms`);
  }
  const selection = new Map(
    coarse
      .filter((c) => c.reversion !== null)
      .map((c) => [c.reversion!.symbol.toUpperCase(), (dir: "bullish" | "bearish") => selectionStrength(dir, c.leadership, c.weak, c.rank)] as const),
  );

  const byCoarseScore = (a: CoarseCandidate, b: CoarseCandidate) => b.coarseScore - a.coarseScore;
  const shortlistSize = perSide * SHORTLIST_MULTIPLE;
  const rerankPool = coarse
    .map((c) => c.reversion)
    .filter((c): c is CoarseCandidate => c !== null)
    .sort(byCoarseScore)
    .slice(0, shortlistSize * YEAR_CYCLE_POOL_MULTIPLE);

  // Yearly-cycle re-rank — see YEAR_CYCLE_POOL_MULTIPLE. Read for every
  // symbol the monthly fetch returned, not just the pool, so telemetry can
  // compare cycle-ranked names against the rest of the universe.
  const monthlyNow = monthlyBatch as Map<string, Bar[]> | null | undefined;
  let yearHits: Map<string, YearCycleConvergence> | null = null;
  if (monthlyNow) {
    yearHits = new Map([...monthlyNow].map(([sym, bars]) => [sym, yearCycleConvergence(bars)]));
  } else if (monthlyNow === undefined && provider.fetchBarsBatch) {
    console.warn(`market-scan: ${scanDate} monthly fetch still running after the coarse pass — yearly-cycle re-rank skipped`);
  }
  mark("yearly-cycle re-rank", yearHits ? `read=${yearHits.size}` : "skipped");
  // Last night's swept setups first (owner, 2026-10-22: Execute setups are
  // pushed first), then the coarse shortlist, same total.
  const coarseShortlist = rankShortlist(rerankPool, shortlistSize, yearHits, selection);
  const shortlist = mergeSweptIntoShortlist(
    stocksOnly(sweptSymbols).slice(0, SWEEP_SLOTS),
    coarseShortlist,
    shortlistSize,
    (symbol) => ({ symbol, direction: "bullish", kind: "reversion", coarseScore: 0 }),
  );
  mark("shortlist", `${shortlist.length} (swept ${Math.min(sweptSymbols.length, SWEEP_SLOTS)})`);
  const continuationPool = coarse
    .map((c) => c.continuation)
    .filter((c): c is CoarseCandidate => c !== null)
    .sort(byCoarseScore);

  // The shortlist's latest prices, read in one request beside the bars.
  const shortlistPricesP = latestPrices(
    shortlist.map((c) => c.symbol),
    "us_equity",
  );

  // Full multi-timeframe pass — batch-fetch all five timeframes for the whole
  // shortlist up front (five requests total) so each scanTicker call below is
  // just scoring, not a fresh five-request fetch per symbol.
  // Bounded (`FULL_PASS_FETCH_DEADLINE_MS`): a fetch still running then is
  // left behind and no stock is scored, since a symbol without its prefetched
  // bars would fetch its own five charts one by one. The crypto and fund
  // passes may still join the lists, so the run reports `equitiesRead: false`
  // and its callers publish nothing: a list without its stocks would
  // overwrite and prune the day's stock rows (`persistDailyScans`).
  // Tokens left as the full pass starts: the side reads must not have taken
  // the ones it needs (2026-10-23, the evening scan's failure).
  mark("full-pass tokens left", String(tokensLeft(ALPACA_PROVIDER_LABEL) ?? "n/a"));
  const shortlistBars = await settleBy(
    fetchAllTimeframesBatch(shortlist.map((c) => c.symbol), EXECUTION_TIMEFRAME, "us_equity", (tf, ms) =>
      mark(`full-pass ${tf} bars`, `${ms}ms`),
    ),
    startedAt + FULL_PASS_FETCH_DEADLINE_MS,
  );
  mark("full-pass batch bar fetch done", shortlistBars ? `shortlist=${shortlist.length}` : "not done by the deadline");
  if (shortlistBars === null) {
    console.warn(
      `market-scan: ${scanDate} full-pass bars not fetched by ${FULL_PASS_FETCH_DEADLINE_MS}ms; nothing scored this run`,
    );
  }
  const shortlistPrices = shortlistBars
    ? ((await settleBy(shortlistPricesP, startedAt + FULL_PASS_FETCH_DEADLINE_MS)) ?? new Map<string, number>())
    : new Map<string, number>();
  mark("full-pass latest prices", `${shortlistPrices.size} of ${shortlist.length} batched`);
  const full = shortlistBars
    ? await mapWithConcurrency(shortlist, 5, (c) =>
        scanTicker(
          c.symbol,
          undefined,
          undefined,
          shortlistBars.get(c.symbol.toUpperCase()),
          universeThresholds,
          shortlistPrices.get(c.symbol.toUpperCase()),
        ),
      )
    : [];
  mark("full-pass scanTicker scoring done");
  const valid = full.filter((r) => !r.error);
  const scanErrors = full.length - valid.length;

  // The daily lists are trade plans, not a watchlist. A symbol only earns a row
  // when the execution timeframe actually armed a pattern in that direction and
  // the plan priced out — entry, stop, TP1 and master profit all present.
  const rank = (dir: "bullish" | "bearish") =>
    valid
      .filter((r) => r.direction === dir && hasTradePlan(r))
      .sort(compareForList);

  // The sell side is kept whole until the shortable check below cuts it.
  const sideLimit = { bullish: perSide, bearish: Infinity };
  const lists: Record<"bullish" | "bearish", ScanResult[]> = {
    bullish: rank("bullish").slice(0, perSide),
    bearish: rank("bearish"),
  };
  const continuationFills = { bullish: 0, bearish: 0 };

  // ---- Continuation pass (item 6 step 11): every run scans the best-ranked
  // candidates running with their trend on each side, up to the top-up
  // ceiling, and they compete with the reversions for the `perSide` slots by
  // score. Gann buys with the trend however high (W006 p.22), so they are not
  // rationed to a shortfall or a fixed allotment.

  // Hoisted so the telemetry build below (outside this block) can see which
  // continuation candidates got a real full scan and what score they made.
  let continuationScanResults: ScanResult[] = [];
  let continuationSkipped = false;

  const elapsedBeforeContinuation = Date.now() - startedAt;
  if (shortlistBars === null) {
    // The feed couldn't serve the shortlist in time; a second fetch for the
    // top-up would only run into the same wait.
    continuationSkipped = true;
  } else if (elapsedBeforeContinuation >= CONTINUATION_DEADLINE_MS) {
    continuationSkipped = true;
    console.warn(
      `market-scan: ${scanDate} skipping continuation pass — ${elapsedBeforeContinuation}ms ` +
        `elapsed, over the ${CONTINUATION_DEADLINE_MS}ms budget`,
    );
  }

  if (!continuationSkipped && continuationPool.length > 0) {
    const excluded = continuationExclusions(lists, perSide);
    const sides = (["bullish", "bearish"] as const).filter((d) => continuationPool.some((c) => c.direction === d));
    // Split the budget across the sides being scanned so one side's pool
    // can't consume every scan and leave the other empty.
    const perSideBudget = Math.floor(MAX_TOPUP_SCANS / Math.max(sides.length, 1));
    // A symbol already scanned in the reversion pass told us its trend. If
    // Gann's weighted trend doesn't run the direction we need, re-scanning it
    // with a direction preference won't change the charts, so skip it and
    // spend the call on a candidate that might.
    const scanned = new Map(valid.map((r) => [r.symbol, r]));
    const cannotArm = (c: CoarseCandidate): boolean => {
      const prior = scanned.get(c.symbol);
      return prior !== undefined && !isWithGannTrend(prior.trends, c.direction);
    };

    const fills = sides.flatMap((dir) =>
      continuationPool
        .filter((c) => c.direction === dir && !excluded[dir].has(c.symbol) && !cannotArm(c))
        .slice(0, perSideBudget),
    );

    // Bounded as the full pass's fetch is, a little later: past it the top-up
    // is skipped and the reversion lists publish as they stand.
    const fillPricesP = latestPrices(
      fills.map((c) => c.symbol),
      "us_equity",
    );
    const fillBars = await settleBy(
      fetchAllTimeframesBatch(fills.map((c) => c.symbol), EXECUTION_TIMEFRAME),
      startedAt + CONTINUATION_FETCH_DEADLINE_MS,
    );
    const fillPrices =
      fillBars === null
        ? new Map<string, number>()
        : ((await settleBy(fillPricesP, startedAt + CONTINUATION_FETCH_DEADLINE_MS)) ?? new Map<string, number>());
    if (fillBars === null) {
      console.warn(`market-scan: ${scanDate} continuation bars not fetched by the deadline; top-up skipped`);
    }
    const scans =
      fillBars === null
        ? []
        : await mapWithConcurrency(fills, 5, (c) =>
            scanTicker(
              c.symbol,
              undefined,
              { direction: c.direction, kind: "continuation" },
              fillBars.get(c.symbol.toUpperCase()),
              universeThresholds,
              fillPrices.get(c.symbol.toUpperCase()),
            ),
          );
    continuationScanResults = scans;
    mark("continuation pass scoring done", `scanned=${scans.length}`);

    for (const dir of ["bullish", "bearish"] as const) {
      const merged = mergeContinuations(lists[dir], scans, dir, sideLimit[dir]);
      lists[dir] = merged.list;
      continuationFills[dir] = merged.added;
    }
  }

  lists.bearish = await takeShortable(dropSellsAlsoBought(lists), perSide);
  // The other markets' setups join the lists (`joinOtherMarkets`), shown
  // under their own headings (`ResultsTable`). Everything waits at most to
  // the continuation deadline, the fund borrow read included.
  const deadline = startedAt + CONTINUATION_DEADLINE_MS;
  const [cryptoScans, fundScans] = await Promise.all([settleBy(cryptoP, deadline), settleBy(fundsP, deadline)]);
  if (cryptoScans === null) {
    console.warn("market-scan: crypto pass not done by the deadline; listed without it");
    mark("crypto pass", "not done by the deadline");
  }
  if (fundScans === null) {
    console.warn("market-scan: funds pass not done by the deadline; listed without it");
    mark("funds pass", "not done by the deadline");
  }
  Object.assign(lists, await joinOtherMarkets(lists, cryptoScans ?? [], fundScans ?? [], deadline));
  mark("other markets joined");
  mark("market-data tokens spent", tokensSpentSince(tokensBefore) || "none");
  const continuationScans = new Set(continuationScanResults);
  continuationFills.bearish = lists.bearish.filter((r) => continuationScans.has(r)).length;

  // The coarse filter's own picks that kept a full-pass slot, so the column
  // still reads "the coarse filter shortlisted it"; a swept symbol the filter
  // rejected is not counted as one.
  const kept = new Set(shortlist.map((c) => c.symbol.toUpperCase()));
  const shortlistedSymbols = new Set(
    coarseShortlist.map((c) => c.symbol.toUpperCase()).filter((sym) => kept.has(sym)),
  );
  const fullScanResults = new Map(
    [
      ...valid,
      ...continuationScanResults.filter((r) => !r.error),
      ...(cryptoScans ?? []).filter((r) => !r.error),
      ...(fundScans ?? []).filter((r) => !r.error),
    ].map((r) => [r.symbol, r]),
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
        cycle_active: d.cycleActive,
        cycle_direction: d.cycleDirection,
        year_cycle_bullish_hits: yearHits?.get(sym)?.bullishHits ?? null,
        year_cycle_bearish_hits: yearHits?.get(sym)?.bearishHits ?? null,
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
    equitiesRead: shortlistBars !== null,
    fullScanResults: [...fullScanResults.values()],
    stockReads: [...full, ...continuationScanResults],
    discoveries,
  };
}
