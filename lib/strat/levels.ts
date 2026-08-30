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

import type { AssetClass, Bar, StratPattern, TradeLevels } from "@/lib/types";
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
): TradeLevels {
  const entry = pattern.triggerPrice;
  const dir = pattern.direction === "bullish" ? 1 : -1;
  const effectiveLargeCap = largeCap && assetClass !== "crypto";

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
    stopPctOfPrice,
    stopBandWarning,
    pivotPlan: buildPivotPlan(pattern, round(stopLoss)),
  };
}

/**
 * The counter-scenario the PRD's Trade Map contract requires: a plain-language
 * answer to "what if this goes the other way," stated in terms of the stop
 * this setup already has rather than a second computed plan. A daily/swing
 * setup does not carry the intraday scanner's session context (VWAP, opening
 * range) to build a full opposite-direction trade plan from, so this is
 * deliberately a narrower counter-scenario than lib/scanner/intraday.ts's
 * `pivotPlan` — what invalidates the thesis and which way to start looking,
 * not a priced opposite entry.
 */
function buildPivotPlan(pattern: StratPattern, stopLoss: number): string {
  const bullish = pattern.direction === "bullish";
  const opposite = bullish ? "bearish" : "bullish";
  return (
    `This ${pattern.direction} ${PATTERN_GLOSSARY_TERM[pattern.name].toLowerCase()} thesis is invalidated if price closes back through the ` +
    `stop at ${stopLoss.toFixed(2)}. That does not itself confirm a ${opposite} trade — it only says the ` +
    `original setup failed. Treat the next scan on this symbol as a fresh read, not a reversal signal.`
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
