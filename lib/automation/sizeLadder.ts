/**
 * Position sizes on a ladder of account sizes, for the portfolio manager's
 * paper trades (owner, 2026-10-28: "make trades of all sizes ... do some 2,
 * 3, 4 & 5 figure purchases/trades", so a reader of the book sees that a
 * trade can be started with any amount and worked up).
 *
 * Gann's own examples run the same method on every size of account: $300 for
 * 10 shares (W006 Rule 1, p.46), "with $1,000, risk $100 (10 shares x 3
 * points)" (*Truth of the Stock Tape*), the $1,000 soybean campaign
 * (*Commodities* pp.134-137), an account opened with $973 and $3,000 grown to
 * $40,000 (W010; *Commodities* p.316), up to 400-share lots, the unit
 * doubling as profits equal the capital (A-RISK-04). Shares follow the
 * capital; nothing else in the method changes with it.
 *
 * So each new paper activation is sized for one rung of the ladder: a
 * position costing two, three or four figures, or the account's own full
 * size (five figures and up). The rung is the one the open book holds
 * fewest of, the smaller first on a tie, so the book carries one of each as
 * room allows. A smaller rung only takes shares away from the account's own
 * size, never adds any, so every one of Gann's ceilings (30 points of capital
 * a share, a tenth at risk, five stocks) still holds, and placement checks
 * them again. Engineering choices, labelled: the rungs are the owner's figure
 * counts, a capped rung buys at most 95% of its top so a fill a little above
 * the entry stays inside it, and the stop and plan are unchanged. Live
 * accounts are never laddered: they trade the account's own size.
 *
 * Three-question basis:
 * 1. Gann: as cited; the method is the same at every capital (Tier A).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence, the same plan at every scale of account.
 * Law of Creation: small account ⊗ full account interact through the one
 * plan, and the third they make is the ladder a beginner climbs.
 */

/** Rungs capped to a figure count; "full" is the account's own size. */
export type SizeRung = 2 | 3 | 4 | "full";

export const SIZE_RUNGS: readonly SizeRung[] = [2, 3, 4, "full"];

/** A capped rung spends at most this share of its top, so a fill above the entry stays in it. */
export const RUNG_HEADROOM = 0.95;

/** Digits in a position's whole-dollar cost ($87 is 2, $1,250 is 4). */
export function costFigures(cost: number): number {
  if (!Number.isFinite(cost)) return 0;
  const whole = Math.floor(Math.abs(cost));
  return whole < 1 ? 0 : String(whole).length;
}

/** The rung an open position already fills. */
export function rungOf(cost: number): SizeRung | null {
  const figures = costFigures(cost);
  if (figures >= 5) return "full";
  return figures === 2 || figures === 3 || figures === 4 ? figures : null;
}

export interface RungChoice {
  rung: SizeRung;
  qty: number;
}

/**
 * The rung and share count for a new activation. `accountQty` is what the
 * account's own sizing gives (the dial's risk over the stop distance);
 * `openCosts` are the costs of positions already open or activated this run.
 * A capped rung is offered only when it holds at least one share and fewer
 * shares than the account's own size (else it is the full size anyway).
 */
export function chooseSizeRung(input: { entry: number; accountQty: number; openCosts: number[] }): RungChoice | null {
  const { entry, accountQty } = input;
  if (!(entry > 0) || !(accountQty >= 1)) return null;
  const held = new Map<SizeRung, number>();
  for (const cost of input.openCosts) {
    const r = rungOf(cost);
    if (r != null) held.set(r, (held.get(r) ?? 0) + 1);
  }
  let best: RungChoice | null = null;
  let bestHeld = Infinity;
  for (const rung of SIZE_RUNGS) {
    const qty = rung === "full" ? accountQty : Math.floor((RUNG_HEADROOM * 10 ** rung) / entry + 1e-9);
    if (qty < 1 || (rung !== "full" && qty >= accountQty)) continue;
    const n = held.get(rung) ?? 0;
    if (n < bestHeld) {
      best = { rung, qty };
      bestHeld = n;
    }
  }
  return best;
}
