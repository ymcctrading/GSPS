/**
 * The member's per-trade dollar cap for the automated portfolio manager
 * (owner, 2026-10-29: "Build dollar cap", so each test account trades inside
 * the amount a trader of that kind would spend: $50, $250, $1,000). Stored on
 * `user_automation_profiles.max_trade_dollars` (migration 0140); null means
 * no cap.
 *
 * A cap only takes shares away. Gann's capital rules (30 points a share, a
 * tenth at risk, five stocks) and every placement check still apply, so the
 * smaller of the two sizes stands; the stop and the plan are unchanged. Gann
 * runs the same method on any capital ($300 for 10 shares, W006 Rule 1 p.46),
 * so a small cap is a small account, not a different method.
 *
 * Engineering choice, labelled: the shares are figured on the price the
 * order is expected at with the size ladder's 95% headroom
 * (`RUNG_HEADROOM`), so an entry that fills a little past its price stays
 * inside the cap.
 *
 * Three-question basis:
 * 1. Gann: shares follow the capital, the method does not (Tier A, as cited).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence, the same plan at every scale of account.
 * Law of Creation: cap ⊗ Gann's sizing is a mixture (the smaller wins), not
 * a creation; nothing new is made by the join.
 */
import { RUNG_HEADROOM } from "@/lib/automation/sizeLadder";

/** A stored cap as a positive number, or null for none. */
export function readTradeDollarCap(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Most whole shares the cap buys at `price`; Infinity when there is no cap. */
export function maxSharesForCap(cap: number | null, price: number): number {
  if (cap == null) return Infinity;
  if (!(price > 0)) return 0;
  return Math.floor((RUNG_HEADROOM * cap) / price + 1e-9);
}

/** `qty` held to the cap at `price` (0 when one share costs more than it allows). */
export function capShares(qty: number, cap: number | null, price: number): number {
  return Math.max(0, Math.min(qty, maxSharesForCap(cap, price)));
}

/** The note a skipped trade carries when one share costs more than the cap. */
export function capRefusal(symbol: string, cap: number, price: number): string {
  return `One share of ${symbol} at $${price.toFixed(2)} costs more than your $${cap.toLocaleString("en-US")} per-trade limit.`;
}
