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
};

/**
 * Default TP2 (runner) R-multiple by asset class. Typically hit after TP1
 * is reached and stop is moved to breakeven or slightly better.
 */
export const TP2_MULTIPLE_BY_ASSET: Record<AssetClass, number> = {
  us_equity: 2.5,
  crypto: 3.0,
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

/** How far beyond the accepted level the stop actually sits — never exactly on it. */
export const EQUITY_STOP_BUFFER_PCT = 0.5;

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
  masterFromStructure: boolean;
}

/**
 * Nearest structural level on the trade's favorable side (support under a
 * long, resistance above a short) that lands inside [minPct, maxPct] of
 * entry — accepting any level in `structuralLevels`, since for stop-anchoring
 * purposes a clustered historical S/R level, a fan line, or a Square-of-9
 * price are all "real structure" in the same sense; scoring criteria that
 * care about which kind matched (historicalSR vs. the Gann-specific ones)
 * read the underlying level data separately, upstream of this function.
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
  for (const level of structuralLevels) {
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
export function computeEquityTradeLevels(params: {
  direction: "bullish" | "bearish";
  entry: number;
  /** Support and resistance prices from any source (clustered S/R, fan lines, Square-of-9) — see nearestStructuralStop. */
  structuralLevels: number[];
  /** Daily ATR as % of price (lib/scoring/proximity.ts#atrPercentOfPrice). Undefined falls back to the min target %. */
  atrPct?: number;
  /** Widens the stop-placement ceiling and fallback — see EQUITY_LARGE_CAP_STOP_MAX_PCT/EQUITY_LARGE_CAP_FALLBACK_STOP_PCT. */
  largeCap?: boolean;
}): EquityTradeLevels {
  const { direction, entry, structuralLevels, atrPct, largeCap = false } = params;
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
  const stopPct = stopFromStructure
    ? (Math.abs(entry - structuralStop) / entry) * 100 + EQUITY_STOP_BUFFER_PCT
    : fallbackStopPct;
  const stopLoss = entry - dir * (stopPct / 100) * entry;

  const tp1Pct = clampPct(
    EQUITY_TP1_ATR_MULTIPLE * (atrPct ?? EQUITY_TP1_MIN_PCT),
    EQUITY_TP1_MIN_PCT,
    EQUITY_TP1_MAX_PCT,
  );
  const takeProfit1 = entry + dir * (tp1Pct / 100) * entry;

  const tp2Pct = clampPct(
    EQUITY_TP2_ATR_MULTIPLE * (atrPct ?? EQUITY_TP2_MIN_PCT),
    EQUITY_TP2_MIN_PCT,
    EQUITY_TP2_MAX_PCT,
  );
  const tp2Target = entry + dir * (tp2Pct / 100) * entry;

  // Runner extension: a real structural level beyond TP2 but inside the cap
  // becomes the target instead of the raw multiple — same idea as
  // `masterFromStructure` in the R-based model.
  const capTarget = entry + dir * (EQUITY_MASTER_CAP_PCT / 100) * entry;
  const structuralExtension = structuralLevels
    .filter((l) => dir * (l - tp2Target) > 0 && dir * (l - capTarget) <= 0)
    .sort((a, b) => dir * (a - b))[0];
  const masterFromStructure = structuralExtension !== undefined;
  const takeProfit2 = structuralExtension ?? tp2Target;

  return {
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(takeProfit2),
    stopFromStructure,
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

export function computeTradeLevels(
  pattern: StratPattern,
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
      structuralLevels: [...gannTargets, ...structuralLevels],
      atrPct: dailyAtrPct,
      largeCap: effectiveLargeCap,
    });
    const equityRisk = Math.abs(entry - equity.stopLoss);
    return {
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
      stopPctOfPrice: (Math.abs(entry - equity.stopLoss) / entry) * 100,
      stopBandWarning: null,
      pivotPlan: buildPivotPlan(pattern, equity.stopLoss, round(entry)),
    };
  }

  // Compute stop with ATR leeway (structural boundary + buffer for noise)
  // If no ATR available, fall back to structural stop only.
  let stopLoss = pattern.stopPrice;
  if (executionAtr && executionAtr > 0) {
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
  const structuralExtension = gannTargets
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
    stopPctOfPrice,
    stopBandWarning,
    pivotPlan: buildPivotPlan(pattern, round(stopLoss), round(entry)),
  };
}

/**
 * The counter-scenario the PRD's Trade Map contract requires: what invalidates
 * this thesis and what a trade in the opposite direction would need before
 * it's worth considering — the same philosophy as lib/scanner/intraday.ts's
 * own `pivotPlan`, described concretely enough to watch or (via the
 * automated portfolio manager's opt-in dial, lib/automation/stop-out.ts) to
 * seed a real trade plan from, rather than a plain note that the original
 * setup failed.
 *
 * Narrower than the intraday version in one respect: a daily/swing setup
 * has no session context (VWAP, opening range, intraday high/low) to derive
 * the pivot trade's *own* stop from, so `invalidation` stays null here —
 * honest about what this timeframe actually knows, rather than fabricating
 * a level nothing in the pattern supports.
 */
function buildPivotPlan(pattern: StratPattern, stopLoss: number, entry: number): PivotPlan {
  const bullish = pattern.direction === "bullish";
  const opposite = bullish ? "bearish" : "bullish";
  return {
    confirmation:
      `This ${pattern.direction} ${PATTERN_GLOSSARY_TERM[pattern.name].toLowerCase()} thesis is invalidated if price closes back through the stop at ${stopLoss.toFixed(2)}. ` +
      `Even then, a ${opposite} trade needs its own evidence: a fresh pattern confirming in the ${opposite} direction, not just this one stopping out.`,
    invalidation: null,
    // Mirrors intraday's choice of VWAP (the level a reversal is expected to
    // retest first): here, that's the level the original thesis entered at.
    firstTarget: entry,
    cancelIf:
      "Price chops between the stop and the entry level without holding either side. Neither direction is worth trading in that state — standing aside is a position.",
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
