/**
 * Which shares at the broker belong to *this* user.
 * -----------------------------------------------------------------------------
 * GSPS currently trades one Alpaca paper account on behalf of every signed-in
 * user (`envCreds("paper")` — see `lib/brokers/alpaca.ts`). The broker
 * therefore reports one book: if two users are long AAPL, Alpaca shows a single
 * AAPL position whose quantity is the sum, with no record of who bought what.
 *
 * Nothing at the broker can answer "is this position mine?", so the answer has
 * to come from our own ledger, which does track it:
 *
 *   - `positions`       — plain trades, one row per open position, `user_id` set.
 *   - `protocol_exits`  — protocol-managed trades. A position bought with
 *                         protocol levels attached deliberately never gets a
 *                         `positions` row (see `lib/portfolio/reconcile.ts`),
 *                         so its plan is the only record that it is held.
 *
 * The two are disjoint by construction, so a symbol's owned quantity is the sum
 * across both without double counting.
 *
 * This module is the single place that computation lives. Every broker call
 * that *acts on* or *reports* a position must pass through it, because the
 * alternative — trusting the broker's book — is what let one user liquidate
 * another user's shares through `/api/positions/close` and let every user read
 * the whole account's balances from `/api/portfolio`.
 *
 * ## What it deliberately does not do
 *
 * It does not claim a position the ledger has no row for. Shares held in the
 * shared account that no GSPS order opened — the account owner's own manual
 * trades, or anything predating the ledger — resolve to zero for everyone. They
 * become invisible in the app and cannot be closed through it, which is the
 * safe direction to fail: the alternative is showing them to whoever asks
 * first.
 *
 * This is a containment layer, not the fix. The fix is per-user brokerage
 * connections, at which point the broker's book *is* the user's book and this
 * module retires.
 */

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A `positions` row, in the two fields ownership depends on. */
export interface OwnedPositionRow {
  symbol: string;
  qty: number | string;
}

/** A `protocol_exits` row, in the two fields ownership depends on. */
export interface OwnedPlanRow {
  symbol: string;
  qty: number | string;
}

export interface OwnershipLedger {
  /** Owned quantity per uppercase symbol. Absent means zero. */
  bySymbol: Map<string, number>;
  /**
   * Set when the ledger could not be read in full.
   *
   * A partial read must never be treated as "the user owns nothing" — that
   * would hide live positions and refuse legitimate closes. Callers surface
   * this rather than acting on an incomplete answer.
   */
  error: string | null;
}

/**
 * Merge ledger rows into owned quantities. Pure — the database read lives in
 * `readOwnershipLedger`, so the arithmetic can be tested without a client.
 *
 * Quantities are absolute: a short position of -100 is 100 shares of exposure,
 * and the direction is not what ownership is deciding. Rows with an
 * unparseable quantity are skipped rather than counted as zero-or-NaN.
 */
export function mergeOwnership(
  positions: OwnedPositionRow[],
  plans: OwnedPlanRow[],
): Map<string, number> {
  const bySymbol = new Map<string, number>();

  const add = (symbol: unknown, qty: unknown) => {
    if (typeof symbol !== "string" || symbol.trim() === "") return;
    const n = Math.abs(Number(qty));
    if (!Number.isFinite(n) || n === 0) return;
    const key = symbol.toUpperCase();
    bySymbol.set(key, (bySymbol.get(key) ?? 0) + n);
  };

  for (const p of positions) add(p.symbol, p.qty);
  for (const p of plans) add(p.symbol, p.qty);

  return bySymbol;
}

/**
 * This user's owned quantity for every symbol they hold.
 *
 * Both reads are scoped by `user_id` explicitly as well as by RLS. The
 * redundancy is deliberate: RLS is the guarantee, and the explicit filter is
 * what keeps the query correct if it is ever run with an elevated client.
 */
export async function readOwnershipLedger(
  supabase: Supabase,
  userId: string,
): Promise<OwnershipLedger> {
  const [positionsRes, plansRes] = await Promise.all([
    supabase
      .from("positions")
      .select("symbol, qty")
      .eq("user_id", userId)
      .eq("closed", false),
    supabase
      .from("protocol_exits")
      .select("symbol, qty")
      .eq("user_id", userId)
      .eq("status", "working"),
  ]);

  const error = positionsRes.error?.message ?? plansRes.error?.message ?? null;
  if (error) {
    return { bySymbol: new Map(), error };
  }

  return {
    bySymbol: mergeOwnership(
      (positionsRes.data ?? []) as OwnedPositionRow[],
      (plansRes.data ?? []) as OwnedPlanRow[],
    ),
    error: null,
  };
}

/** Owned quantity for one symbol. Zero when the ledger has no row for it. */
export function ownedQty(ledger: OwnershipLedger, symbol: string): number {
  return ledger.bySymbol.get(symbol.toUpperCase()) ?? 0;
}

/** Float slop for "these two quantities are the same". Mirrors the close route. */
const QTY_EPSILON = 1e-6;

export interface CloseAuthorization {
  /** Whether any broker call may be made at all. */
  allowed: boolean;
  /**
   * The quantity to send to the broker. Always explicit — never undefined.
   *
   * `closePosition` with no quantity liquidates the broker's *whole* position,
   * which in a shared account is everyone's. Even a full close of the user's
   * own holding is expressed as a number for that reason.
   */
  qty: number;
  /** User-facing sentence when `allowed` is false. */
  reason: string | null;
}

/**
 * How much of `symbol` this user may close, given what they own and what the
 * broker actually holds.
 *
 * Three refusals, each for its own reason:
 *   - the ledger says they own none of it;
 *   - the broker holds less than the ledger claims (a reconciliation gap —
 *     closing on that basis could reach into someone else's shares);
 *   - they asked for more than they own.
 *
 * An over-large request is refused rather than silently clamped. Quietly
 * closing 40 shares when the user asked for 100 looks identical to success and
 * leaves them believing they are flat.
 */
export function authorizeClose(input: {
  owned: number;
  brokerHeld: number | null;
  requested: number | undefined;
}): CloseAuthorization {
  const { owned, brokerHeld, requested } = input;

  if (owned <= 0) {
    return {
      allowed: false,
      qty: 0,
      reason:
        "This position isn't in your account's records, so it can't be closed from here.",
    };
  }

  if (brokerHeld == null) {
    return {
      allowed: false,
      qty: 0,
      reason:
        "The broker's position for this symbol couldn't be read, so the close wasn't sent. Try again in a moment.",
    };
  }

  if (brokerHeld + QTY_EPSILON < owned) {
    return {
      allowed: false,
      qty: 0,
      reason:
        "Your records and the broker's don't agree on this position's size, so it wasn't closed. Refresh the portfolio and try again.",
    };
  }

  // No quantity means "close my position" — the user's, not the account's.
  if (requested == null) {
    return { allowed: true, qty: owned, reason: null };
  }

  if (requested > owned + QTY_EPSILON) {
    return {
      allowed: false,
      qty: 0,
      reason: `You hold ${owned} of this position, so ${requested} can't be closed.`,
    };
  }

  return { allowed: true, qty: Math.min(requested, owned), reason: null };
}
