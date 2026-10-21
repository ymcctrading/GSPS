/**
 * GSPS — the trade plan's stop and target constants, kept apart from
 * `levels.ts` so client code can read them without bundling the plan
 * builder and the Gann readers behind it (review finding R-033,
 * 2026-10-21). Type-only imports: this module must stay a leaf.
 */

import type { AssetClass } from "@/lib/types";

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
export const DEFAULT_TP1_MULTIPLE = 2.0;
export const DEFAULT_TP2_MULTIPLE = 3.0;

export type StopSide = "long" | "short";

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
