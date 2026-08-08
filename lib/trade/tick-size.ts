/**
 * Instrument-aware limit-price validation.
 * -----------------------------------------------------------------------------
 * A limit price is not a free-form number. Every venue quotes on a minimum
 * price increment, and a price that falls between two increments is refused
 * before it ever reaches a book:
 *
 *   Invalid limit_price 49.755. sub-penny increment does not fulfill
 *   minimum pricing criteria.
 *
 * That rejection arrives from the broker *after* the user has committed to the
 * order, and — because the order never existed at the broker — it used to leave
 * no trace anywhere in the app. This module moves the check in front of the
 * submit button: work out the increment the instrument actually trades on,
 * snap the price to it, and say plainly what the corrected price is and which
 * way it moved.
 *
 * Where the increments come from
 * ------------------------------
 * `source` on every quote says which rule produced it, because the two are not
 * equally trustworthy and the UI has to be able to tell the user which one it
 * is standing on:
 *
 *   "broker"     — the venue published this increment for this instrument.
 *   "regulatory" — derived from the SEC/OPRA default for the instrument's type
 *                  and price band. Correct for the overwhelming majority of
 *                  names, but it is a default, not a lookup.
 *
 * Equities follow SEC Rule 612 (the sub-penny rule): quotes at or above $1.00
 * move in $0.01, quotes below $1.00 move in $0.0001.
 *
 * Listed options follow the OPRA increments: $0.05 below $3.00 and $0.10 at or
 * above it, except for classes in the Penny Interval Program, which quote in
 * $0.01 below $3.00. Class membership is not derivable from the symbol, so a
 * penny-program class has to arrive as broker metadata — absent that, the
 * conservative (wider) standard increment is used. Rounding to a wider
 * increment than the venue requires produces a valid price either way; guessing
 * a narrower one produces exactly the rejection this module exists to prevent.
 */

/** How a price that falls between two increments should be snapped. */
export type RoundingMode = "down" | "nearest" | "up";

export type TickSource = "broker" | "regulatory";

export interface TickSize {
  /** The minimum price increment, in dollars. */
  size: number;
  source: TickSource;
  /** One sentence naming the rule, for the disclosure under the price field. */
  rule: string;
}

export interface InstrumentPricing {
  assetType: "EQUITY" | "OPTION";
  /**
   * Increment published by the broker for this instrument, when it publishes
   * one. Overrides the regulatory default.
   */
  brokerTickSize?: number | null;
  /**
   * True when the option class quotes in the Penny Interval Program. Only
   * meaningful for options, and only when it came from broker metadata —
   * leaving it undefined selects the wider standard increment.
   */
  pennyProgram?: boolean;
}

const EQUITY_SUB_DOLLAR_TICK = 0.0001;
const EQUITY_TICK = 0.01;
const OPTION_PENNY_TICK = 0.01;
const OPTION_LOW_TICK = 0.05;
const OPTION_HIGH_TICK = 0.1;
/** OPRA's increment step-up, and Rule 612's, both sit at their own boundary. */
const OPTION_TICK_BOUNDARY = 3;
const EQUITY_TICK_BOUNDARY = 1;

/**
 * Floating-point money needs a fixed scale to compare against. Every increment
 * this module deals with is a whole number of hundredths of a cent, so working
 * in ten-thousandths makes every comparison exact.
 */
const SCALE = 10000;

function toScaled(dollars: number): number {
  return Math.round(dollars * SCALE);
}

function fromScaled(units: number): number {
  return units / SCALE;
}

/**
 * The increment `price` must be a multiple of.
 *
 * The price matters because both rule sets change increment at a boundary, so
 * this is a function of the instrument *and* where the order is priced — which
 * is why it can't be cached per symbol and handed out as a constant.
 */
export function tickSizeFor(instrument: InstrumentPricing, price: number): TickSize {
  if (instrument.brokerTickSize != null && instrument.brokerTickSize > 0) {
    return {
      size: instrument.brokerTickSize,
      source: "broker",
      rule: `This instrument trades in ${formatIncrement(instrument.brokerTickSize)} increments at your broker.`,
    };
  }

  if (instrument.assetType === "OPTION") {
    if (price >= OPTION_TICK_BOUNDARY) {
      return {
        size: OPTION_HIGH_TICK,
        source: "regulatory",
        rule: "Options priced at $3.00 or above quote in 10-cent increments.",
      };
    }
    if (instrument.pennyProgram) {
      return {
        size: OPTION_PENNY_TICK,
        source: "broker",
        rule: "This contract's class quotes in 1-cent increments below $3.00.",
      };
    }
    return {
      size: OPTION_LOW_TICK,
      source: "regulatory",
      rule: "Options priced below $3.00 quote in 5-cent increments unless the contract's class trades in pennies.",
    };
  }

  if (price < EQUITY_TICK_BOUNDARY) {
    return {
      size: EQUITY_SUB_DOLLAR_TICK,
      source: "regulatory",
      rule: "Shares priced below $1.00 quote in increments of $0.0001.",
    };
  }
  return {
    size: EQUITY_TICK,
    source: "regulatory",
    rule: "Shares priced at $1.00 or above quote in whole cents — no sub-penny prices.",
  };
}

/** True when `price` sits exactly on a multiple of `tick`. */
export function isOnTick(price: number, tick: number): boolean {
  const scaledTick = toScaled(tick);
  if (scaledTick <= 0) return true;
  return toScaled(price) % scaledTick === 0;
}

/**
 * Snap `price` to a multiple of `tick`.
 *
 * "down" and "up" are absolute directions on the number line, not
 * buy/sell-relative ones — `conservativeMode` is what maps a side onto them.
 */
export function snapToTick(price: number, tick: number, mode: RoundingMode): number {
  const scaledTick = toScaled(tick);
  if (scaledTick <= 0) return price;
  const scaledPrice = toScaled(price);
  const quotient = scaledPrice / scaledTick;
  const units =
    mode === "down"
      ? Math.floor(quotient)
      : mode === "up"
        ? Math.ceil(quotient)
        : Math.round(quotient);
  return fromScaled(units * scaledTick);
}

/**
 * The rounding direction that cannot move the order against the user.
 *
 * A buy rounds down, so the corrected limit is never above the price they
 * typed — they can't be filled at more than they intended. A sell rounds up,
 * so they can't be filled at less. Both give up some fill probability in
 * exchange, which is what `fillProbabilityNote` says out loud.
 */
export function conservativeMode(side: "buy" | "sell"): RoundingMode {
  return side === "buy" ? "down" : "up";
}

export interface PriceValidation {
  /** True when the order can be submitted at `price`. */
  ok: boolean;
  /** The price to submit. Null when no valid price could be produced. */
  price: number | null;
  /** The price the user asked for, unchanged. */
  requested: number;
  tick: TickSize | null;
  /** True when `price` differs from `requested`. */
  adjusted: boolean;
  /** Which way the correction moved, relative to the requested price. */
  direction: "down" | "up" | "none";
  /** Why submission is blocked. Null when `ok`. */
  blockedReason: string | null;
  /** Plain-language sentence describing the correction, for display. */
  explanation: string;
  /** How the correction changes the odds of getting filled. */
  fillProbabilityNote: string | null;
}

export interface ValidateLimitPriceInput {
  price: number;
  side: "buy" | "sell";
  instrument: InstrumentPricing;
  /**
   * Rounding behaviour. Omit for the conservative-by-side default (buys round
   * down, sells round up).
   */
  mode?: RoundingMode;
  /**
   * False when the instrument's pricing metadata could not be fetched. The
   * order is blocked rather than priced against a guess.
   */
  metadataAvailable?: boolean;
}

/**
 * Validate and, where possible, correct a limit price.
 *
 * Never returns a price it isn't sure of: an unavailable instrument, a
 * non-finite input, or a correction that lands at or below zero all block the
 * order instead of submitting something the broker will refuse.
 */
export function validateLimitPrice(input: ValidateLimitPriceInput): PriceValidation {
  const { price, side, instrument } = input;
  const mode = input.mode ?? conservativeMode(side);

  const blocked = (reason: string): PriceValidation => ({
    ok: false,
    price: null,
    requested: price,
    tick: null,
    adjusted: false,
    direction: "none",
    blockedReason: reason,
    explanation: reason,
    fillProbabilityNote: null,
  });

  if (!Number.isFinite(price) || price <= 0) {
    return blocked("Enter a limit price above zero.");
  }
  if (input.metadataAvailable === false) {
    return blocked(
      "We couldn't confirm the minimum price increment for this instrument, so this order can't be priced safely. Try again in a moment, or place it at market.",
    );
  }

  const tick = tickSizeFor(instrument, price);

  // Always return the value snapped to the grid, never the caller's float.
  //
  // `isOnTick` compares in integer ten-thousandths, so a price that is on-tick
  // *as a decimal* passes even when its binary representation is not — the
  // arithmetic that produces trade levels routinely yields values like
  // `1.12 + 0.01 === 1.1300000000000001`. Returning that untouched sent
  // `String(1.1300000000000001)` to the broker and drew exactly the sub-penny
  // rejection this module exists to prevent. Snapping is a no-op on the
  // decimal value and normalizes the float, so the two can't disagree.
  const corrected = snapToTick(price, tick.size, mode);

  if (isOnTick(price, tick.size)) {
    return {
      ok: true,
      price: corrected,
      requested: price,
      tick,
      adjusted: false,
      direction: "none",
      blockedReason: null,
      explanation: `${formatPrice(corrected)} is a valid price. ${tick.rule}`,
      fillProbabilityNote: null,
    };
  }

  // Rounding down from inside the first increment lands on zero. There is no
  // valid price on the requested side of the market, so the order is blocked
  // rather than repriced to something nonsensical.
  if (!(corrected > 0)) {
    return blocked(
      `${formatPrice(price)} is below the smallest valid price for this instrument (${formatPrice(
        tick.size,
      )}). Raise the limit price or place the order at market.`,
    );
  }

  const direction = corrected < price ? "down" : "up";

  return {
    ok: true,
    price: corrected,
    requested: price,
    tick,
    adjusted: true,
    direction,
    blockedReason: null,
    explanation: `${formatPrice(price)} isn't a valid price — ${lowerFirst(
      tick.rule,
    )} Your order will be placed at ${formatPrice(corrected)}.`,
    fillProbabilityNote: fillProbabilityNote(side, direction),
  };
}

/**
 * What moving the limit price costs or buys, in the terms a novice cares
 * about: the worst price they can be filled at, and whether they still get
 * filled at all.
 */
export function fillProbabilityNote(side: "buy" | "sell", direction: "down" | "up"): string {
  if (side === "buy") {
    return direction === "down"
      ? "Because this is a buy, rounding down means you'll never pay more than you intended — but a lower limit is slightly less likely to fill."
      : "Because this is a buy, rounding up makes a fill slightly more likely — but it raises the most you could pay by one increment.";
  }
  return direction === "up"
    ? "Because this is a sell, rounding up means you'll never receive less than you intended — but a higher limit is slightly less likely to fill."
    : "Because this is a sell, rounding down makes a fill slightly more likely — but it lowers the least you could receive by one increment.";
}

/** Human label for a rounding mode, for the selector in the ticket. */
export const ROUNDING_MODE_LABELS: Record<RoundingMode, string> = {
  down: "Round down",
  nearest: "Round to nearest",
  up: "Round up",
};

function formatIncrement(tick: number): string {
  return tick < 0.01 ? `$${tick.toFixed(4)}` : `$${tick.toFixed(2)}`;
}

function formatPrice(price: number): string {
  return price < 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`;
}

function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}
