/**
 * One new entry at a time per account (senior review F-05).
 *
 * The order path reads the open positions, checks Gann's capital rules (at
 * most five stocks, 30 points of capital a share, a tenth of the unit at risk;
 * `lib/risk/gannCapital.ts`) and then writes the order. Without a lock, two
 * orders placed together (two tabs, Guided and the portfolio manager) could
 * each read the book before the other wrote, and both pass. The rules are
 * Gann's; this only makes sure each order is judged against the book the one
 * before it left.
 *
 * The lock is a short lease in `order_placement_locks` (migration 0087),
 * taken before the checks and given back after the write. It expires on its
 * own (`LEASE_SECONDS`), so a crashed request never holds an account for
 * long. A second order waits for the first rather than failing at once, and
 * is refused only if the first is still running after `WAIT_MS`.
 *
 * Fails closed: if the lease can't be read, the entry is refused and nothing
 * is placed, the same as an unreadable book. Protective orders never take the
 * lease, so it can never stand between a trader and a stop or a close.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Longer than any one placement (a quote, a few reads, a write). */
export const LEASE_SECONDS = 30;
/** How long a second order waits for the first to finish. */
export const WAIT_MS = 8_000;
const POLL_MS = 250;

type Refusal = { status: number; body: Record<string, unknown> };

const BUSY: Refusal = {
  status: 409,
  body: {
    error: "Another order on this account is still being placed. Nothing was placed; try again in a moment.",
    code: "order_in_progress",
  },
};

const UNREADABLE: Refusal = {
  status: 503,
  body: {
    error: "The account could not be checked for another order in progress. Nothing was placed; try again in a moment.",
    code: "order_lock_unavailable",
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `place` while holding the account's order lease. Returns a refusal,
 * without calling `place`, when the lease can't be taken.
 */
export async function withOrderLock<T>(
  supabase: SupabaseClient,
  userId: string,
  place: () => Promise<T>,
  options: { waitMs?: number; pollMs?: number } = {},
): Promise<T | Refusal> {
  const token = randomUUID();
  const deadline = Date.now() + (options.waitMs ?? WAIT_MS);
  for (;;) {
    const { data, error } = await supabase.rpc("try_acquire_order_lock", {
      p_user_id: userId,
      p_token: token,
      p_ttl_seconds: LEASE_SECONDS,
    });
    if (error) {
      console.error(`order-lock: lease unreadable for ${userId} — ${error.message}`);
      return UNREADABLE;
    }
    if (data === true) break;
    if (Date.now() >= deadline) return BUSY;
    await sleep(options.pollMs ?? POLL_MS);
  }
  try {
    return await place();
  } finally {
    const { error } = await supabase.rpc("release_order_lock", { p_user_id: userId, p_token: token });
    // The lease lapses on its own; a failed release only delays the next order.
    if (error) console.error(`order-lock: release failed for ${userId} — ${error.message}`);
  }
}
