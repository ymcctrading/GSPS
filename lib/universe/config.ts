/**
 * Novice Market Universe — thresholds, straight from the spec pack.
 *
 * Two tiers throughout: an "initial" configurable threshold the engine is
 * shipped with, and a stricter "core" preference the spec names as the
 * target to validate toward once execution data exists to validate against
 * (see each constant's doc comment for which is which). Nothing here is
 * derived — every number is a literal transcription; the modules in this
 * directory are the logic that reads them.
 */

/** Absolute floor. Below this a symbol is never Novice-eligible, full stop. */
export const MARKET_CAP_FLOOR_USD = 10_000_000_000;

/** Preferred core floor — symbols between the two are eligible but not core. */
export const MARKET_CAP_CORE_FLOOR_USD = 20_000_000_000;

/** Initial configurable average-daily-dollar-volume threshold. */
export const NOVICE_LIQUIDITY_FLOOR_USD = 250_000_000;

/** Core preference — validate against execution data before tightening to this. */
export const NOVICE_LIQUIDITY_CORE_FLOOR_USD = 500_000_000;

/** Preferred accessible price band. Outside it, confirmed fractional-share support is required instead. */
export const PRICE_BAND_MIN_USD = 10;
export const PRICE_BAND_MAX_USD = 125;

/**
 * Max spread as a percent of price. The spec gives two independent tests
 * ("as % of price and fraction of stop distance") without a specific number
 * for either — this is an engineering-chosen conservative default in the
 * same spirit as `lib/scan/liquidity.ts`'s floor, not spec-derived. Revisit
 * once a real bid/ask feed exists to validate against (see spread.ts).
 */
export const MAX_SPREAD_PCT_OF_PRICE = 0.5;

/** Max spread as a fraction of the trade's own stop distance — a wide spread is worse the tighter the stop. */
export const MAX_SPREAD_FRACTION_OF_STOP = 0.15;

/**
 * Volatility band, expressed as ATR% of price (ATR(14) / close). Below the
 * floor a name is too dead to reach a target inside a normal hold window;
 * above the ceiling the stop distance required to survive normal noise no
 * longer fits the Novice risk budget. Engineering-chosen — the spec names
 * "volatility_pass" as a required filter without a specific band.
 */
export const MIN_ATR_PCT_OF_PRICE = 0.5;
export const MAX_ATR_PCT_OF_PRICE = 8;

/**
 * How many whole-share-equivalent units an account must be able to hold
 * before the staged TP1/TP2/runner exit is feasible without fractional-share
 * support. Below this, the spec requires the all-in/all-out fallback.
 */
export const MIN_WHOLE_UNITS_FOR_STAGED_EXIT = 4;

/**
 * Data-freshness ceilings, per the spec's "Data contracts and freshness"
 * table. Exceeding any of these blocks a *new* high-tier signal — it does
 * not touch management of an existing position, per the spec's
 * "cooldown/lock never blocks stop/TP/reduce/close" precedent applied here
 * to data staleness the same way.
 */
export const MAX_QUOTE_STALENESS_SECONDS = 60;
export const MAX_FUNDAMENTALS_STALENESS_DAYS = 120;
export const MAX_ACCOUNT_SNAPSHOT_STALENESS_MINUTES = 15;
