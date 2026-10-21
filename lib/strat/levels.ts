/**
 * Trade levels per the protocol:
 *  - Entry: the pattern trigger line (break by one penny).
 *  - Stop: structural (one penny opposite the trigger candle) + ATR leeway buffer
 *    to avoid false stops in noise while respecting structural invalidation.
 *  - TP1: asset-class-dependent default (1.5R for most), or the previous candle's
 *    high/low if that structural target is further.
 *  - TP2 (runner): asset-class-dependent (2.5–3R), scaled after TP1 hit.
 *  - Stop sanity: advisory only — the structural stop respects the invalidation
 *    while leeway prevents noise whipsaws. Which advisory applies depends on what
 *    is known (see the warning block below).
 */

import { gannReversal } from "@/lib/gann/reverse";
import type { GannEntryKind, GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { levelOnFigure, stopBeyondFigure, targetCandidates } from "@/lib/gann/evenFigures";
import { beyondByThreePoints, gannThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";
import type { AssetClass, Bar, PivotPlan, StratPattern, TradeLevels } from "@/lib/types";
import { readPremiumStop } from "@/lib/trade/premium-stop";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";

/**
 * Widest structural stop worth taking on the execution timeframe, in average
 * candles. This is the ceiling to the floor in lib/strat/patterns.ts: below a
 * third of an average candle the stop is inside the noise, above two and a
 * half the structural level is so far away that TP1 at 2R needs a five-candle
 * run to pay. Measured over ~48 sessions of AAPL 15-minute bars, it flags the
 * widest 2.7% of setups that clear the floor (median 0.8x, p95 2.0x), and it
 * sits inside the 1.5–3x ATR range conventionally used for stop placement.
 */
export const MAX_STOP_ATR_MULTIPLE = 2.5;

/**
 * The large-cap widening. A structural stop this tight on a mega-cap name
 * routinely gets clipped by ordinary intraday noise before the setup has had
 * room to move — the trade was right, the stop was just narrower than the
 * name's own noise floor. Both numbers below only apply when
 * `isLargeCapStock` (lib/strat/large-cap.ts) says so:
 *
 *   - The noise-leeway buffer more than doubles (0.10x -> 0.25x an average
 *     execution candle), so the stop sits further behind the structural
 *     level before the leeway trims it back.
 *   - The ceiling widens from 2.5x to 3.5x, so a structural stop that would
 *     otherwise be clipped back to the 2.5x ceiling can stay closer to the
 *     level that actually invalidates the setup.
 *
 * The effect compounds with Guided Mode's per-trade dollar budget
 * (`DEFAULT_GUIDED_BUDGET_USD`, lib/guided/config.ts): a wider stop means more
 * risk per share, so the same risk-percent budget buys fewer shares —
 * addressing the "why is this recommending 100+ shares" complaint from the
 * same conversation, on top of fixing premature stop-outs.
 *
 * This is a deliberate, unmeasured widening — the 2.5x ceiling above and the
 * 0.10x leeway were derived from an AAPL sample (see their own comments);
 * this pair has not been separately backtested. Treat it as a hypothesis to
 * validate once `docs/BACKTESTING.md`'s replay can be run against it, not as
 * a re-tuned constant with the same evidence behind it.
 */
export const LARGE_CAP_LEEWAY_ATR = 0.25;
export const LARGE_CAP_MAX_STOP_ATR_MULTIPLE = 3.5;

/**
 * Default TP1 R-multiple by asset class. Most strategies hit higher win rates
 * with moderate first targets (1.5R), scaling the runner (TP2) higher to keep
 * upside. Adjusted for market microstructure and typical move distribution.
 */
export const TP1_MULTIPLE_BY_ASSET: Record<AssetClass, number> = {
  us_equity: 1.5,
  crypto: 1.5,
  // Placeholder pending a real commodities feed (lib/data/commodity.ts) — no
  // trade has ever been placed against this asset class, so there's nothing
  // to derive a commodity-specific multiple from yet. Mirrors us_equity
  // rather than inventing a number; revisit once real data/trades exist.
  // Three-question mandate (AGENTS.md): a type-completeness filler with zero
  // supporting data is not a design decision to reason through yet — the
  // mandate applies once a real commodity multiple is actually chosen.
  commodity: 1.5,
};

/**
 * Default TP2 (runner) R-multiple by asset class. Typically hit after TP1
 * is reached and stop is moved to breakeven or slightly better.
 */
export const TP2_MULTIPLE_BY_ASSET: Record<AssetClass, number> = {
  us_equity: 2.5,
  crypto: 3.0,
  // Same placeholder rationale as TP1_MULTIPLE_BY_ASSET above.
  commodity: 2.5,
};

/**
 * Ceiling on how far a structural master target may sit from entry. A Gann or
 * harmonic level beyond this is real structure, but it is too far to describe
 * as the trade's target — the runner would be holding for a move several times
 * the size of the setup that produced it.
 */
export const MASTER_CAP_R = 5;

/** Fallback multipliers when asset class is not provided (for backward compatibility). */
const DEFAULT_TP1_MULTIPLE = 2.0;
const DEFAULT_TP2_MULTIPLE = 3.0;

type StopSide = "long" | "short";

/**
 * Equities' own exit model — percentage of purchase price, not a multiple of
 * risk. Added 2026-09-11 per direct request: an unlevered stock is a 1:1
 * payoff (a $1 move is a $1 gain or loss per share), which makes demanding a
 * 2:1 reward:risk ratio a structurally harder bar than it is on a levered
 * instrument (futures, crypto, options, forex), where the same underlying
 * move is amplified relative to capital at risk. R:R stays the model for
 * those; this block is `us_equity` only.
 *
 * These are starting defaults, not measured constants — flagged explicitly
 * because nothing in this codebase has backtested them yet (unlike
 * MAX_STOP_ATR_MULTIPLE above, which traces to a real sample). The first
 * thing a validation pass on this model should do is challenge every number
 * here against real outcomes, the same way docs/BACKTESTING.md already does
 * for the R-based constants.
 */

/**
 * TP1 (first partial) and TP2/master (runner) sizing, as a multiple of the
 * stock's own daily-ATR-as-percent-of-price (`atrPercentOfPrice`,
 * lib/scoring/proximity.ts) — a volatile name aims further in % terms than a
 * quiet one, the same spirit as the R-based system's risk-relative sizing,
 * just anchored to price instead of a computed risk distance. Runners/TP2
 * are kept deliberately (not collapsed to one flat target) to build the same
 * scale-out habit the R-based model already teaches novice traders.
 */
export const EQUITY_TP1_ATR_MULTIPLE = 2.0;
export const EQUITY_TP2_ATR_MULTIPLE = 3.5;

/** Clamp bounds so an extreme-ATR name can't produce an absurd (near-0% or 60%) target. */
export const EQUITY_TP1_MIN_PCT = 3;
export const EQUITY_TP1_MAX_PCT = 15;
export const EQUITY_TP2_MIN_PCT = 6;
export const EQUITY_TP2_MAX_PCT = 25;

/**
 * Ceiling on how far a structural level may sit and still extend the runner
 * to it, mirroring `MASTER_CAP_R`'s job in the R-based model — real structure
 * beyond this is too far to describe as this trade's target.
 */
export const EQUITY_MASTER_CAP_PCT = 30;

/**
 * The stop-placement band: a nearby support (long) / resistance (short)
 * level is accepted as the stop only if it lands inside this range of entry
 * price. This is also the min/max guardrail — a level tighter than the floor
 * would get clipped by ordinary noise (defeating the "loose enough not to
 * worry about" requirement this whole model was built around); a level past
 * the ceiling is not really this trade's risk anymore. A level outside the
 * band is treated as "none found," the same as no level existing at all.
 */
export const EQUITY_STOP_MIN_PCT = 3;
export const EQUITY_STOP_MAX_PCT = 15;

/**
 * The fallback stop when no structural level lands inside the accepted band
 * — true for the large majority of setups (historicalSR, the criterion
 * reading the same underlying level data, passes on roughly 18-19% of real
 * setups measured so far). Deliberately a fixed percentage rather than an
 * ATR-derived one: an ATR fallback would quietly reintroduce the volatility-
 * relative reasoning this model exists to move away from for equities.
 * 8% is a well-known retail swing-trading convention (close to the classic
 * "sell if down 7-8%" rule), not a number this codebase has measured.
 */
export const EQUITY_FALLBACK_STOP_PCT = 8;

/**
 * The large-cap widening's own equivalent under the percent model — added
 * 2026-09-11, same day as the model itself, because the R-based version's
 * large-cap widening (`LARGE_CAP_LEEWAY_ATR`/`LARGE_CAP_MAX_STOP_ATR_MULTIPLE`
 * above) became unreachable dead code the moment `us_equity` started
 * short-circuiting to this branch: it only ever applied to stocks, and now
 * stocks never reach it. Same underlying reasoning as the original — "a
 * structural stop this tight on a mega-cap name routinely gets clipped by
 * ordinary intraday noise" — carried over into percentage terms rather than
 * left to quietly disappear.
 *
 * Both numbers widen by roughly the same ratio the original large-cap
 * constants did (ceiling 2.5x -> 3.5x is 1.4x; fallback here goes 8% -> 12%,
 * 1.5x, deliberately rounded to a number a novice reads as clean rather than
 * matched to the ratio to the decimal). The floor (`EQUITY_STOP_MIN_PCT`)
 * does not widen: a level 3% away is not "clipped by noise" on a large-cap
 * name any more than on a small one, so there is nothing there for large-cap
 * status to loosen. Starting defaults, not measured — same caveat as every
 * other constant in this block.
 */
export const EQUITY_LARGE_CAP_STOP_MAX_PCT = 20;
export const EQUITY_LARGE_CAP_FALLBACK_STOP_PCT = 12;

export interface EquityTradeLevels {
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  stopFromStructure: boolean;
  /** An old level stands 3 points in front of the stop (`oldLevelBehindStop`; Q23). */
  stopBehindOldLevel: boolean;
  /** TP1 sits on a Gann or S/R level (parity C4) rather than the ATR fallback. */
  tp1FromStructure: boolean;
  masterFromStructure: boolean;
}

/**
 * How close two structural levels must sit (as a percent of their own
 * average) before they're treated as "the same" resistance point rather than
 * two separate ones.
 */
const NEARBY_LEVEL_TOLERANCE_PCT = 1.0;

/**
 * Combine structural levels that sit within `NEARBY_LEVEL_TOLERANCE_PCT` of
 * each other into a single averaged level — `How to Make Profits Trading in
 * Commodities` (A8, `docs/GANN_HISTORICAL_SOURCES.md`)'s disclosed
 * "resistance points near same levels" technique: "when two nearby
 * resistance levels cluster, average them into one combined support/
 * resistance point," rather than treating a clustered S/R level, a fan line,
 * and a Square-of-9 price that all happen to sit within a percent of each
 * other as three separate, competing candidates. Added 2026-09-16 per
 * `docs/GANN_PLATFORM_AUDIT.md` Part 4 item 3 / AGENTS.md's "WD Gann
 * precedence" principle — his literal cents-based "lost motion" stop-buffer
 * number (the same A8 passage) is deliberately NOT ported here: that figure
 * is dimensionally a 1930s-commodity number (cents per bushel), not an
 * equity percentage, and porting its raw magnitude across asset class and
 * era would be a guess dressed up as a derivation. This clustering rule is
 * the one part of the same disclosed passage that transfers cleanly with no
 * unit conversion required.
 */
function combineNearbyLevels(levels: number[]): number[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const current = clusters[clusters.length - 1];
    const mean = current.reduce((s, p) => s + p, 0) / current.length;
    if ((Math.abs(sorted[i] - mean) / mean) * 100 <= NEARBY_LEVEL_TOLERANCE_PCT) current.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map((c) => c.reduce((s, p) => s + p, 0) / c.length);
}

/**
 * Nearest structural level on the trade's favorable side (support under a
 * long, resistance above a short) that lands inside [minPct, maxPct] of
 * entry. Callers pass only clustered historical S/R here — see
 * `computeEquityTradeLevels`'s `structuralLevels` param for why Gann-derived
 * targets are deliberately excluded from this search as of 2026-09-15.
 * Nearby levels are combined first — see `combineNearbyLevels`.
 */
function nearestStructuralStop(
  entry: number,
  side: StopSide,
  structuralLevels: number[],
  minPct: number,
  maxPct: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const level of combineNearbyLevels(structuralLevels)) {
    const onFavorableSide = side === "long" ? level < entry : level > entry;
    if (!onFavorableSide) continue;
    const distPct = (Math.abs(entry - level) / entry) * 100;
    if (distPct < minPct || distPct > maxPct) continue;
    if (distPct < bestDist) {
      best = level;
      bestDist = distPct;
    }
  }
  return best;
}

function clampPct(pct: number, minPct: number, maxPct: number): number {
  return Math.min(maxPct, Math.max(minPct, pct));
}

/**
 * Equities' stop and targets, all expressed as (clamped) percentages of
 * entry price rather than multiples of a computed risk distance. Kept as a
 * standalone function rather than folded into `computeTradeLevels`'s single
 * flow: the two models don't share intermediate values (there is no "risk"
 * this stop is a multiple of — targets and the stop are each derived
 * independently from price and structure), so branching mid-function would
 * only tangle two unrelated derivations together.
 */
/**
 * The old top or bottom that stands in front of the stop by at least Gann's 3
 * points: between the stop and the entry, with the stop 3 points or more
 * beyond it (W006 pp.20-24, 46-47: buy, and place the stop 3 points under the
 * old bottom; the mirror for a short). Nearest such level to the stop, or
 * null. One cent of slack absorbs the rounding of a stop priced exactly 3
 * points beyond its level (engineering choice). Owner, Q23, 2026-10-16: the
 * scored `stopBehindOldLevel` point, which replaced `stopRoom`.
 */
export function oldLevelBehindStop(
  direction: "bullish" | "bearish",
  entry: number,
  stop: number,
  levels: readonly number[],
): number | null {
  const dir = direction === "bullish" ? 1 : -1;
  let best: number | null = null;
  for (const L of levels) {
    if (!(dir * (entry - L) > 0)) continue;
    if (!(dir * (L - stop) >= gannThreePoints(L) - 0.01)) continue;
    if (best === null || dir * (L - best) < 0) best = L;
  }
  return best;
}

export function computeEquityTradeLevels(params: {
  direction: "bullish" | "bearish";
  entry: number;
  /**
   * Clustered historical S/R prices only — the same source `historicalSR`
   * reads — used to anchor the stop. Narrowed from "any structural level" to
   * "S/R only" on 2026-09-15: `stopRoom`'s us_equity branch (does this stop
   * come from real structure) measured 98-99.5% saturated on every real,
   * unconditioned run captured that day (see lib/validation/criteria-
   * registry.ts's `stopRoom` entry), traced to Gann-derived targets being
   * pooled in here — dense enough across the wide (3-20% for large-cap) band
   * that a level was found almost every time, so the fixed-percentage
   * fallback essentially never fired and the criterion stopped
   * discriminating. `historicalSR` alone passes only ~18-19% of real setups
   * (see EQUITY_FALLBACK_STOP_PCT), which is the selectivity this was
   * supposed to have. Gann targets still extend the runner — see
   * `extensionLevels` — only the stop's own search narrowed.
   */
  structuralLevels: number[];
  /**
   * Levels the runner (TP2/master) may extend to beyond its raw ATR-scaled
   * target — see the "Runner extension" block below. Defaults to
   * `structuralLevels` when omitted. Separated from the stop's search
   * 2026-09-15 (see `structuralLevels` above) because the runner-extension
   * rate was never measured saturated — only the stop was — so pooling Gann
   * targets in here is unchanged, still a real key-price-level target to aim
   * a scale-out at, not "is this setup real" the way the stop's own
   * structural question is.
   */
  extensionLevels?: number[];
  /**
   * Apply Gann's even-figure rule to the stop and targets (default true).
   * False isolates the other rules, for tests and measurement.
   */
  evenFigures?: boolean;
  /** Daily ATR as % of price (lib/scoring/proximity.ts#atrPercentOfPrice). Undefined falls back to the min target %. */
  atrPct?: number;
  /** Widens the stop-placement ceiling and fallback — see EQUITY_LARGE_CAP_STOP_MAX_PCT/EQUITY_LARGE_CAP_FALLBACK_STOP_PCT. */
  largeCap?: boolean;
  /**
   * A stop fixed by Gann's crossing rule (the crossed level less 3 points;
   * PLAN.md item 4). Used as given. `stopFromStructure` is still read from the
   * S/R band, because the `stopRoom` criterion asks whether real support sits
   * behind the trade, which the fixed stop does not answer.
   */
  stopLoss?: number;
}): EquityTradeLevels {
  const { direction, entry, structuralLevels, extensionLevels = structuralLevels, atrPct, largeCap = false, evenFigures = true } = params;
  const side: StopSide = direction === "bullish" ? "long" : "short";
  const dir = direction === "bullish" ? 1 : -1;

  const stopMaxPct = largeCap ? EQUITY_LARGE_CAP_STOP_MAX_PCT : EQUITY_STOP_MAX_PCT;
  const fallbackStopPct = largeCap ? EQUITY_LARGE_CAP_FALLBACK_STOP_PCT : EQUITY_FALLBACK_STOP_PCT;

  const structuralStop = nearestStructuralStop(
    entry,
    side,
    structuralLevels,
    EQUITY_STOP_MIN_PCT,
    stopMaxPct,
  );
  const stopFromStructure = structuralStop !== null;
  // A structural stop sits Gann's 3 points beyond its level, once. Where the
  // level rests on an even figure, the figure is the level ("an old top of 100
  // crossed means a stop at 97"; lib/gann/evenFigures.ts), unless that would
  // carry the stop past the band's ceiling. A fallback stop has no level, so
  // the even-figure rule moves it past a figure it sits just inside.
  let stopLoss: number;
  if (params.stopLoss != null) {
    stopLoss = params.stopLoss;
  } else if (structuralStop !== null) {
    const anchored = evenFigures ? levelOnFigure(structuralStop, direction) : structuralStop;
    const ceiling = stopMaxPct + gannThreePointsPct(entry);
    const fromFigure = beyondByThreePoints(anchored, -dir as 1 | -1);
    stopLoss = (Math.abs(entry - fromFigure) / entry) * 100 <= ceiling
      ? fromFigure
      : beyondByThreePoints(structuralStop, -dir as 1 | -1);
  } else {
    const rawStop = entry - dir * (fallbackStopPct / 100) * entry;
    stopLoss = evenFigures ? stopBeyondFigure(entry, rawStop, direction, stopMaxPct + gannThreePointsPct(entry)) : rawStop;
  }

  // Targets (parity C4, owner decision 2, 2026-09-27: "Gann's method
  // supersedes my own"). Gann never fixes a profit objective; he sells at the
  // resistance levels his rules identify (*Truth of the Stock Tape*, Book II).
  // So TP1 is the nearest such level (Gann targets and clustered S/R, the
  // `extensionLevels` pool) inside the TP1 band, and the master target the
  // next one beyond it inside the cap. The ATR-scaled percentage survives only
  // as the fallback when no level lies in the band, and the flags say which
  // was used. Beyond the master, the runner leaves on a Gann trend-change
  // signal (`lib/gann/exitRules.ts`), not at a price.
  const atrTp1 = entry + dir * (clampPct(EQUITY_TP1_ATR_MULTIPLE * (atrPct ?? EQUITY_TP1_MIN_PCT), EQUITY_TP1_MIN_PCT, EQUITY_TP1_MAX_PCT) / 100) * entry;
  const atrTp2Pct = clampPct(
    EQUITY_TP2_ATR_MULTIPLE * (atrPct ?? EQUITY_TP2_MIN_PCT),
    EQUITY_TP2_MIN_PCT,
    EQUITY_TP2_MAX_PCT,
  );
  const pctFrom = (level: number) => (dir * (level - entry) / entry) * 100;
  // Even figures are resistance too: each contributes a target just before
  // it, since markets turn just short of round numbers (Gann; see
  // lib/gann/evenFigures.ts).
  const capForFigures = entry + dir * (EQUITY_MASTER_CAP_PCT / 100) * entry;
  const figureTargets = evenFigures ? targetCandidates(entry, capForFigures, direction) : [];
  // Resistance points near the same level are one point (M-P4, the same rule
  // as the stop's, `combineNearbyLevels`): averaged before TP1 and the master
  // are read from them (review B, 2026-10-16; until then only the stop was).
  const ascending = [...combineNearbyLevels(extensionLevels), ...figureTargets].sort((a, b) => dir * (a - b));
  // TP1 is the first level that pays more than the risk (fixed 2026-10-21).
  // Gann: "don't trade for 3-5 points unless the stop can be 1-2 points";
  // "profits must exceed losses" (*Wall Street Stock Selector* Ch. II, *45
  // Years* pp.16-26), and a swing is held through minor resistance until a
  // reverse swing, never scalped (*Commodities* p.316, M-E8). Until this date
  // TP1 was simply the nearest level past the band's fixed 3% floor. Gann's
  // reaction stop is 4 price-scaled points (about 12% of a $30 stock, 5% at
  // $200, 2% at $700; pointScale.ts), so that level sat inside the risk on
  // most stocks under about $250 even when Gann levels stood beyond it, and
  // M-K5's hold in score.ts read as a price filter (on the 2026-10-20 run it
  // held 526 of the 701 trades scoring 6+). The nearest level in the band is
  // still TP1 when none beyond the risk is in it, so M-K5 holds a plan whose
  // Gann levels within reach do not pay the risk.
  const riskDistance = Math.abs(entry - stopLoss);
  const inBand = ascending.filter((l) => pctFrom(l) >= EQUITY_TP1_MIN_PCT && pctFrom(l) <= EQUITY_TP1_MAX_PCT);
  // One cent beyond the risk, so the rounded plan clears M-K5's "no farther than the risk".
  const levelTp1 = inBand.find((l) => dir * (l - entry) > riskDistance + 0.01) ?? inBand[0];
  const tp1FromStructure = levelTp1 !== undefined;
  const takeProfit1 = levelTp1 ?? atrTp1;

  // The master: the next level beyond TP1 (by at least the TP1 band's floor
  // again, so the two are not the same resistance), inside the cap.
  const capTarget = entry + dir * (EQUITY_MASTER_CAP_PCT / 100) * entry;
  const tp2Target = Math.max(atrTp2Pct, pctFrom(takeProfit1) + EQUITY_TP1_MIN_PCT);
  const tp2Floor = entry + dir * (tp2Target / 100) * entry;
  const structuralExtension = ascending.find(
    (l) => dir * (l - takeProfit1) > 0 && pctFrom(l) - pctFrom(takeProfit1) >= EQUITY_TP1_MIN_PCT && dir * (l - capTarget) <= 0,
  );
  const masterFromStructure = structuralExtension !== undefined;
  const takeProfit2 = structuralExtension ?? tp2Floor;

  return {
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(takeProfit2),
    stopFromStructure,
    // A stop fixed by Gann's crossing rule is the crossed level less 3 points
    // by construction; any other stop is checked against the S/R list.
    stopBehindOldLevel: params.stopLoss != null || oldLevelBehindStop(direction, entry, stopLoss, structuralLevels) !== null,
    tp1FromStructure,
    masterFromStructure,
  };
}

/**
 * Compute stop-loss with structural boundary + ATR leeway buffer.
 * Prevents stops from being too tight (noise whipsaw) while respecting
 * the true structural invalidation level.
 */
/**
 * Exported so the backtest replay (`lib/backtest/replay.ts`) can measure the
 * effect of the leeway/large-cap widening on trade outcomes directly. The
 * replay's own P&L walk uses the raw pattern stop by default, independent of
 * this function — `computeTradeLevels`'s stop only reaches the live scan, the
 * ticker page, and Guided Mode's sizing. Without this export there is no way
 * to ask the replay "what if the stop it actually walked against were the
 * production one instead", which is exactly the question a claim like "this
 * reduces premature stop-outs" has to answer with a number, not an assertion.
 */
export function computeStopWithLeeway(params: {
  side: StopSide;
  entry: number;
  structuralStop: number;
  atr15: number;
  /** Large-cap stocks get more noise leeway and a wider ceiling — see the constants' own comments. */
  largeCap?: boolean;
}) {
  const { side, entry, structuralStop, atr15, largeCap = false } = params;

  const leewayAtr = largeCap ? LARGE_CAP_LEEWAY_ATR : 0.1; // ATR leeway
  const minStopPct = 0.001; // 0.1% of price
  const minStopWidth = Math.max(entry * minStopPct, 0.1 * atr15);
  const maxStopWidth = (largeCap ? LARGE_CAP_MAX_STOP_ATR_MULTIPLE : MAX_STOP_ATR_MULTIPLE) * atr15;

  const leewayCandidate =
    side === "long"
      ? entry - leewayAtr * atr15
      : entry + leewayAtr * atr15;

  let sl =
    side === "long"
      ? Math.min(structuralStop, leewayCandidate)
      : Math.max(structuralStop, leewayCandidate);

  const risk = Math.abs(entry - sl);

  if (!isFinite(risk) || !isFinite(sl) || risk <= 0) {
    sl = structuralStop;
  }

  const risk2 = Math.abs(entry - sl);

  if (risk2 < minStopWidth) {
    sl = side === "long" ? entry - minStopWidth : entry + minStopWidth;
  } else if (risk2 > maxStopWidth) {
    sl = side === "long" ? entry - maxStopWidth : entry + maxStopWidth;
  }

  sl = Math.max(sl, 0.01);

  return sl;
}

/**
 * The minimum an entry rule must supply to price a trade: a direction, the
 * price that arms it, and the structural stop behind it.
 *
 * Widened from `StratPattern` to this on 2026-09-17 so the trade plan is
 * priced from Gann's own entry rule (`lib/gann/entryTrigger.ts` — crossing an
 * old swing top/bottom plus the 3-point allowance) rather than from the
 * bar-sequence pattern's trigger. `StratPattern` still satisfies this shape
 * structurally, which is what keeps the existing tests meaningful, but the
 * live scan and the replay now both pass a `GannEntryTrigger`.
 *
 * Nothing else in this function changed: it only ever read `direction`,
 * `triggerPrice` and `stopPrice` off its first argument. Naming that
 * explicitly is the point — the dependency was on three numbers, not on
 * STRAT, and the old signature hid that.
 */
export interface EntrySource {
  direction: "bullish" | "bearish";
  /** The price that must be exceeded for the trade to trigger. */
  triggerPrice: number;
  /** Structural stop behind the trigger. */
  stopPrice: number;
  /**
   * Short, user-facing name for the setup, used in the invalidation copy.
   * Optional because the two sources name themselves differently: a
   * bar-sequence pattern has a glossary term keyed by `name`, while a
   * swing-crossing trigger is described by what it crossed. When absent,
   * `buildPivotPlan` falls back to a neutral phrase rather than inventing one.
   */
  setupLabel?: string;
  /** Which of Gann's buying points this is; carried onto the plan (`TradeLevels.entryKind`). */
  entryKind?: GannEntryKind;
  /** The crossed level's source when it is not a swing (`TradeLevels.entrySource`). */
  entrySource?: "priorYear" | "allTime";
  /** A previous year's level: its year (`TradeLevels.entryLevelYear`). */
  entryLevelYear?: number;
  /** A crossing that regained an old level after a break (`TradeLevels.entryRegained`). */
  entryRegained?: true;
  /** A held bottom's rule (`TradeLevels.holdBasis`). */
  holdBasis?: "weeks" | "days" | "record" | "rally" | "narrowWeek";
  /**
   * True when this source is Gann's reaction buy after a crossing (PLAN.md
   * item 4; W006 pp.20, 46-47): `triggerPrice` is the level plus 1 point and
   * `stopPrice` the level less 3 points. Both are used exactly as given, on
   * every asset class: no structural re-anchoring for stocks and no ATR
   * leeway for crypto, because Gann fixes the stop at 3 points past the
   * crossed level.
   */
  gannReaction?: boolean;
}

/**
 * The plan Gann's crossing rule prices, shared by the live scan and the replay
 * so the two cannot drift (PLAN.md item 4). The close past the old top by 3
 * points (`triggerPrice`) arms it; the order is the reaction buy at the level
 * plus 1 point, stopped at the level less 3 points (W006 pp.20, 46-47). Shorts
 * are the mirror.
 */
export function gannEntrySource(trigger: GannEntryTrigger): EntrySource {
  const long = trigger.direction === "bullish";
  const multiple = (trigger.tests ?? 1) >= 2 ? "triple" : "double";
  return {
    direction: trigger.direction,
    triggerPrice: trigger.reactionEntry,
    stopPrice: trigger.reactionStop,
    setupLabel:
      trigger.kind === "hold"
        ? trigger.holdBasis === "record"
          ? "record low that held"
          : trigger.holdBasis === "rally"
            ? "bear-market rally"
            : trigger.holdBasis === "narrowWeek"
              ? "narrow week broken down"
            : `single ${long ? "bottom" : "top"}`
        : trigger.kind === "oldLevel"
          ? `${multiple} ${long ? "bottom" : "top"}`
          : trigger.regained
            ? long
              ? "regained old bottom"
              : "lost old top"
          : trigger.source === "priorYear"
            ? trigger.levelYear !== undefined
              ? `${trigger.levelYear} ${long ? "top crossing" : "bottom break"}`
              : long
                ? "previous year's top crossing"
                : "previous year's bottom break"
            : trigger.source === "allTime"
              ? long
                ? "old record high crossing"
                : "old record low break"
              : long
                ? "swing-top crossing"
                : "swing-bottom break",
    entryKind: trigger.kind,
    ...(trigger.kind === "crossing" && trigger.source !== "swing" ? { entrySource: trigger.source } : {}),
    ...(trigger.kind === "crossing" && trigger.source === "priorYear" && trigger.levelYear !== undefined ? { entryLevelYear: trigger.levelYear } : {}),
    ...(trigger.kind === "crossing" && trigger.regained ? { entryRegained: true as const } : {}),
    ...(trigger.kind === "hold" && trigger.holdBasis ? { holdBasis: trigger.holdBasis } : {}),
    gannReaction: true,
  };
}

/**
 * The price targets the Gann reading offers a plan (fork FL6 a, 2026-10-16):
 * the Square of Nine's prices, Gann's own wheel. The fan lines' prices are
 * spaced in ATR units, not on Gann's scale, so they stay on the chart and
 * card but are not targets until FL4 settles a Gann price unit.
 */
export function gannTargetPool(gann: { fanLines: { price: number }[]; squareOf9: { price: number }[] }): number[] {
  return gann.squareOf9.map((s) => s.price);
}

export function computeTradeLevels(
  pattern: EntrySource,
  previousBar: Bar,
  gannTargets: number[],
  optionPremium?: number,
  executionAtr?: number,
  assetClass?: AssetClass,
  /** Widens the stop's noise leeway and ceiling — see `LARGE_CAP_LEEWAY_ATR`. Stocks only; ignored for crypto. */
  largeCap = false,
  /**
   * `us_equity` only: support/resistance prices to anchor the stop to and
   * extend the runner toward — see `computeEquityTradeLevels`. Ignored for
   * every other asset class, which keep the R-based model below unchanged.
   */
  structuralLevels: number[] = [],
  /** `us_equity` only: daily ATR as % of price, for ATR-scaled target sizing. Undefined falls back to the minimum target %. */
  dailyAtrPct?: number,
): TradeLevels {
  const entry = pattern.triggerPrice;
  const dir = pattern.direction === "bullish" ? 1 : -1;
  const effectiveLargeCap = largeCap && assetClass !== "crypto";

  if (assetClass === "us_equity") {
    const equity = computeEquityTradeLevels({
      direction: pattern.direction,
      entry,
      // S/R only for the stop (see structuralLevels's own doc comment on
      // computeEquityTradeLevels) — Gann targets stay in the runner's own
      // extension pool below, unchanged.
      structuralLevels,
      extensionLevels: [...gannTargets, ...structuralLevels],
      atrPct: dailyAtrPct,
      largeCap: effectiveLargeCap,
      stopLoss: pattern.gannReaction ? pattern.stopPrice : undefined,
    });
    const equityRisk = Math.abs(entry - equity.stopLoss);
    return {
      ...(pattern.entryKind ? { entryKind: pattern.entryKind } : {}),
      ...(pattern.entrySource ? { entrySource: pattern.entrySource } : {}),
      ...(pattern.entryLevelYear !== undefined ? { entryLevelYear: pattern.entryLevelYear } : {}),
    ...(pattern.entryLevelYear !== undefined ? { entryLevelYear: pattern.entryLevelYear } : {}),
      ...(pattern.entryRegained ? { entryRegained: true as const } : {}),
      ...(pattern.holdBasis ? { holdBasis: pattern.holdBasis } : {}),
      entry: round(entry),
      stopLoss: equity.stopLoss,
      takeProfit1: equity.takeProfit1,
      takeProfit2: equity.takeProfit2,
      masterProfit: equity.takeProfit2,
      riskPerShare: round(equityRisk),
      rewardToRiskTp1: equityRisk > 0 ? Math.abs(equity.takeProfit1 - entry) / equityRisk : 0,
      rewardToRiskTp2: equityRisk > 0 ? Math.abs(equity.takeProfit2 - entry) / equityRisk : 0,
      rewardToRiskMaster: equityRisk > 0 ? Math.abs(equity.takeProfit2 - entry) / equityRisk : 0,
      masterFromStructure: equity.masterFromStructure,
      stopFromStructure: equity.stopFromStructure,
      stopBehindOldLevel: equity.stopBehindOldLevel,
      stopPctOfPrice: (Math.abs(entry - equity.stopLoss) / entry) * 100,
      stopBandWarning: null,
      pivotPlan: buildPivotPlan(pattern, equity.stopLoss, round(entry)),
    };
  }

  // Compute stop with ATR leeway (structural boundary + buffer for noise)
  // If no ATR available, fall back to structural stop only.
  let stopLoss = pattern.stopPrice;
  if (executionAtr && executionAtr > 0 && !pattern.gannReaction) {
    stopLoss = computeStopWithLeeway({
      side: pattern.direction === "bullish" ? "long" : "short",
      entry,
      structuralStop: pattern.stopPrice,
      atr15: executionAtr,
      largeCap: effectiveLargeCap,
    });
  }

  const risk = Math.abs(entry - stopLoss);

  // A pattern whose trigger and stop are the same price has no risk
  // to size against and no R-multiple to project targets from. Every detected
  // pattern puts them a penny either side of a bar, so this only fires on
  // corrupt input.
  if (risk <= 0) {
    throw new Error(
      `Invalid trade levels: entry and stop are both ${round(entry)} — the pattern has no risk to size against.`,
    );
  }

  // TP1: asset-class-default R-multiple, or the previous candle's high/low if
  // that structural target is further than the default multiple.
  //
  // Do not score anything on which branch wins here. Every pattern sets its
  // trigger a penny beyond the signal candle's extreme and its stop a penny
  // beyond the other side, so `risk` is close to that candle's own range, and
  // the structural branch needs the *previous* candle's extreme to clear a
  // multiple of it. Measured against the old flat 2R floor it fired zero times
  // in 6,362 armed setups; the lower asset-class multiples here make it
  // reachable, but nothing has re-measured how often. The scored structural
  // criterion reads the master target instead — see docs/BACKTESTING.md.
  const tp1Multiple = assetClass
    ? TP1_MULTIPLE_BY_ASSET[assetClass]
    : DEFAULT_TP1_MULTIPLE;
  const structuralT1 = pattern.direction === "bullish" ? previousBar.h : previousBar.l;
  const tp1Target = entry + dir * tp1Multiple * risk;
  const takeProfit1 =
    dir * (structuralT1 - entry) > dir * (tp1Target - entry) && dir * (structuralT1 - entry) > 0
      ? structuralT1
      : tp1Target;

  // TP2 (runner): asset-class-dependent, snaps to structural extensions.
  // If TP1 (via structural extension) runs past TP2, step the runner out by 1R.
  const tp2Multiple = assetClass
    ? TP2_MULTIPLE_BY_ASSET[assetClass]
    : DEFAULT_TP2_MULTIPLE;
  const tp2Target = entry + dir * tp2Multiple * risk;
  const fiveR = entry + dir * MASTER_CAP_R * risk;

  // If TP1 has overrun TP2 (structural TP1 beyond the calculated TP2), step master out further
  const tp1OverrunsTP2 = dir * (takeProfit1 - tp2Target) > 0;
  const masterFloor = tp1OverrunsTP2 ? takeProfit1 : tp2Target;
  const steppedMaster = tp1OverrunsTP2 ? takeProfit1 + dir * risk : tp2Target;
  const masterCap = dir * (fiveR - steppedMaster) > 0 ? fiveR : steppedMaster + dir * risk;
  const structuralExtension = combineNearbyLevels(gannTargets)
    .filter((g) => dir * (g - masterFloor) > 0 && dir * (g - masterCap) <= 0)
    .sort((a, b) => dir * (a - b))[0];
  const masterFromStructure = structuralExtension !== undefined;
  const masterProfit = structuralExtension ?? steppedMaster;

  // Use structural risk for warning checks (the actual setup as presented,
  // before ATR bounds are applied). The computed risk may have been constrained
  // by ATR leeway bounds, so we check the original structural setup against
  // the bands to inform the trader about the underlying setup quality.
  const structuralRisk = Math.abs(entry - pattern.stopPrice);
  const stopPctOfPrice = (structuralRisk / entry) * 100;
  let stopBandWarning: string | null = null;

  if (optionPremium && optionPremium > 0) {
    // The scan has a premium but never a delta, so this reading assumes the
    // contract moves point-for-point with the underlying. The strike ticket
    // knows the contract's delta and reports the exact figure — same rule,
    // same wording, from lib/trade/premium-stop.ts.
    stopBandWarning = readPremiumStop({ risk: structuralRisk, premium: optionPremium })?.warning ?? null;
  } else if (executionAtr && executionAtr > 0) {
    // No premium: the honest question is whether the stop is sane for how much
    // this instrument moves, not what fraction of the notional it represents.
    // Measuring against share price puts every intraday structural stop at
    // 0.1–1%, which can never reach 12% — so the old fallback warned on every
    // equity scan, and told the reader to increase size while doing it.
    const atrMultiple = structuralRisk / executionAtr;
    const effectiveMaxStopAtrMultiple = effectiveLargeCap ? LARGE_CAP_MAX_STOP_ATR_MULTIPLE : MAX_STOP_ATR_MULTIPLE;
    if (atrMultiple > effectiveMaxStopAtrMultiple) {
      stopBandWarning = `Structural stop is ${atrMultiple.toFixed(1)}× the average candle on the execution timeframe — an unusually wide setup. Reduce size, or wait for a tighter trigger.`;
    }
  }

  // Invariant: master profit must be strictly more extreme than TP1, which
  // must be strictly more extreme than entry, in the trade direction. The
  // target derivation above guarantees this for any well-formed pattern, so
  // these are assertions against corrupt input rather than an expected outcome
  // — a structural TP1 running past 3R is handled, not rejected.
  if (dir * (takeProfit1 - entry) <= 0) {
    throw new Error(
      `Invalid trade levels: TP1 (${round(takeProfit1)}) is not beyond entry (${round(entry)}) in the ${pattern.direction} direction.`,
    );
  }
  if (dir * (masterProfit - takeProfit1) <= 0) {
    throw new Error(
      `Invalid trade levels: master profit (${round(masterProfit)}) is not more extreme than TP1 (${round(takeProfit1)}) in the ${pattern.direction} direction.`,
    );
  }

  return {
    ...(pattern.entryKind ? { entryKind: pattern.entryKind } : {}),
    ...(pattern.entrySource ? { entrySource: pattern.entrySource } : {}),
    ...(pattern.entryLevelYear !== undefined ? { entryLevelYear: pattern.entryLevelYear } : {}),
    ...(pattern.entryRegained ? { entryRegained: true as const } : {}),
    ...(pattern.holdBasis ? { holdBasis: pattern.holdBasis } : {}),
    entry: round(entry),
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(masterProfit),
    masterProfit: round(masterProfit),
    riskPerShare: round(risk),
    rewardToRiskTp1: risk > 0 ? Math.abs(takeProfit1 - entry) / risk : 0,
    rewardToRiskTp2: risk > 0 ? Math.abs(masterProfit - entry) / risk : 0,
    rewardToRiskMaster: risk > 0 ? Math.abs(masterProfit - entry) / risk : 0,
    masterFromStructure,
    // Only meaningful for the equities percent-model above — the R-based
    // model here has no notion of "structural vs. fallback" stop, so this is
    // always false rather than a claim about this stop's own quality.
    stopFromStructure: false,
    // Gann's reaction stop is its level less 3 points by construction.
    stopBehindOldLevel: Boolean(pattern.gannReaction) || oldLevelBehindStop(pattern.direction, entry, stopLoss, structuralLevels) !== null,
    stopPctOfPrice,
    stopBandWarning,
    pivotPlan: buildPivotPlan(pattern, round(stopLoss), round(entry)),
  };
}

/**
 * The counter-scenario the PRD's Trade Map contract requires, read through
 * Gann's own rule for it (A-EXIT-02, W006 p.48 Rule 6; owner's Q15,
 * 2026-10-16): reverse when caught. If the stop is hit, the opposite trade
 * enters at the stop with its own stop 3 points beyond the old trade's best
 * price (`lib/gann/reverse.ts`). At plan time the best price is the entry, so
 * `invalidation` is that floor; the exit manager uses the real high or low
 * when the stop is hit, and automation seeds the plan from it
 * (lib/automation/stop-out.ts). The reversal still has to confirm, like every
 * entry. `firstTarget` is the level the original thesis entered at, the first
 * old level the reversal meets.
 */
function buildPivotPlan(pattern: EntrySource, stopLoss: number, entry: number): PivotPlan {
  const bullish = pattern.direction === "bullish";
  const opposite = bullish ? "bearish" : "bullish";
  // "setup" is the neutral fallback: a trigger that isn't a named bar sequence
  // still has a thesis to invalidate, and naming it something it isn't would
  // be worse than naming it generically.
  const label = pattern.setupLabel ?? "setup";
  const reversal = gannReversal({ side: bullish ? "long" : "short", brokenLevel: stopLoss, extreme: entry });
  const extremeWord = bullish ? "highest" : "lowest";
  return {
    confirmation:
      `This ${pattern.direction} ${label.toLowerCase()} thesis is invalidated if price trades through the stop at ${stopLoss.toFixed(2)}. ` +
      `The rules then reverse: a ${opposite} trade at ${stopLoss.toFixed(2)}, its stop 3 points beyond the ${extremeWord} price this trade reaches, once the entry confirms.`,
    invalidation: reversal ? round(reversal.stop) : null,
    firstTarget: entry,
    cancelIf:
      "Price chops between the stop and the entry level without holding either side. Neither direction is worth trading in that state — standing aside is a position.",
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
