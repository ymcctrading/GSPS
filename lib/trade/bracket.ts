/**
 * Bracket-order price validation.
 *
 * Alpaca rejects a bracket whose legs sit on the wrong side of the entry, and
 * the rejection is opaque:
 *
 *   {"base_price":"483.505","code":42210000,
 *    "message":"stop_loss.stop_price must be <= base_price - 0.01"}
 *
 * That happens routinely in this app: the protocol computes its stop against
 * the *advised* entry, so choosing "Buy now (market)" at a price below the
 * advised entry can leave the protocol stop above the fill — a stop that would
 * trigger instantly, which is why the broker refuses it.
 *
 * The rules Alpaca enforces for a long bracket (mirrored for a short):
 *   stop_loss.stop_price   <= base_price - 0.01
 *   take_profit.limit_price >= base_price + 0.01
 *
 * `base_price` is the limit price on a limit entry, and the current quote on a
 * market entry. Validating here means the ticket can explain the problem while
 * the user can still fix it, rather than after the order round-trips.
 *
 * For sub-penny stocks (< $1), a fixed 0.01 gap can be excessive as a % of price.
 * The gap scales with price to stay in the 1–2% band for any instrument, but never
 * falls below 0.001 (a tenth of a penny, supported by most brokers).
 */

/** Absolute minimum separation for Alpaca bracket orders. */
const ALPACA_MIN_GAP = 0.01;

/** Percentage-based gap for sub-penny instruments. Minimum 1% of price. */
const SUB_PENNY_GAP_PCT = 0.01; // 1%

/** Sub-penny threshold: use percentage-based gap for prices below this. */
const SUB_PENNY_THRESHOLD = 1.0;

/** Minimum gap even for the cheapest penny stocks. */
const ABSOLUTE_MIN_GAP = 0.001;

/**
 * Calculate the minimum separation required between bracket legs.
 * For stocks < $1, scales with price; for >= $1, uses Alpaca's 0.01 minimum.
 */
export function bracketMinGap(price: number): number {
  if (price >= SUB_PENNY_THRESHOLD) {
    return ALPACA_MIN_GAP;
  }
  // For sub-penny: use 1% of price, but never below 0.001
  return Math.max(ABSOLUTE_MIN_GAP, price * SUB_PENNY_GAP_PCT);
}

export type BracketSide = "buy" | "sell";

export interface BracketInput {
  side: BracketSide;
  /** Limit price for a limit entry, latest trade for a market entry. */
  basePrice: number;
  stopLoss: number;
  takeProfit: number;
}

export type BracketProblem = "stop_wrong_side" | "target_wrong_side" | "no_base_price";

export interface BracketCheck {
  ok: boolean;
  problem?: BracketProblem;
  /** Sentence to show the user, already naming the offending prices. */
  reason?: string;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * Check a bracket against the entry it would attach to.
 *
 * Returns `ok: true` when Alpaca would accept the legs. A missing or
 * non-positive base price is reported rather than assumed valid — attaching a
 * bracket to an unknown entry is exactly the case that fails at the broker.
 */
export function checkBracket(input: BracketInput): BracketCheck {
  const { side, basePrice, stopLoss, takeProfit } = input;

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return {
      ok: false,
      problem: "no_base_price",
      reason: "No reference price is available yet, so protocol levels can't be attached to this order.",
    };
  }

  const minGap = bracketMinGap(basePrice);

  if (side === "buy") {
    if (!(stopLoss <= basePrice - minGap)) {
      return {
        ok: false,
        problem: "stop_wrong_side",
        reason: `The protocol stop (${usd(stopLoss)}) is at or above the entry price (${usd(basePrice)}). A stop on a long has to sit below the entry, so the broker would reject the bracket.`,
      };
    }
    if (!(takeProfit >= basePrice + minGap)) {
      return {
        ok: false,
        problem: "target_wrong_side",
        reason: `The protocol target (${usd(takeProfit)}) is at or below the entry price (${usd(basePrice)}). A take-profit on a long has to sit above the entry, so the broker would reject the bracket.`,
      };
    }
    return { ok: true };
  }

  if (!(stopLoss >= basePrice + minGap)) {
    return {
      ok: false,
      problem: "stop_wrong_side",
      reason: `The protocol stop (${usd(stopLoss)}) is at or below the entry price (${usd(basePrice)}). A stop on a short has to sit above the entry, so the broker would reject the bracket.`,
    };
  }
  if (!(takeProfit <= basePrice - minGap)) {
    return {
      ok: false,
      problem: "target_wrong_side",
      reason: `The protocol target (${usd(takeProfit)}) is at or above the entry price (${usd(basePrice)}). A take-profit on a short has to sit below the entry, so the broker would reject the bracket.`,
    };
  }
  return { ok: true };
}
