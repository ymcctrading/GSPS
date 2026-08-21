/**
 * GSPS — daily reset for the showcase demo profile.
 *
 * `profiles.is_demo` marks the one account shown to prospective investors,
 * partners, teammates, and prospects. It has to look first-run every time
 * someone signs into it, which means two things: the tour always fires (see
 * app/api/onboarding/route.ts), and anything traded on it never survives past
 * the trading day it happened on.
 *
 * There is no free Vercel cron slot to run a nightly job on (vercel.json is
 * already at the Hobby plan's 2/day cap), so this follows the same
 * check-on-read pattern `manageSimulatedExits` uses to advance staged exits:
 * whichever request touches the account first after the ET trading date has
 * rolled over pays the (cheap, one-time) cost of wiping it.
 */

import { etDateKey } from "@/lib/market/session";
import { STARTING_CASH } from "@/lib/brokers/simulator";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface DemoResetResult {
  /** Whether this user is the showcase demo profile at all. */
  isDemo: boolean;
  /** Whether a reset actually ran on this call. */
  reset: boolean;
}

const NOT_DEMO: DemoResetResult = { isDemo: false, reset: false };

/**
 * Wipe the demo account back to a clean $100,000 slate if the ET trading
 * date has moved on since its last reset. A no-op for every other user, and
 * a cheap no-op for the demo user on every call after the first one on a
 * given trading day.
 *
 * Fails closed: any read/write error here is swallowed and treated as
 * "nothing to do" rather than surfaced, since this runs inline on ordinary
 * page-load and polling requests that have nothing to do with demo upkeep —
 * a stale demo balance for the rest of a day is a cosmetic problem, and one
 * far cheaper than breaking real requests over it.
 */
export async function resetDemoAccountIfStale(
  supabase: Supabase,
  userId: string,
): Promise<DemoResetResult> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_demo")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_demo) return NOT_DEMO;

    const today = etDateKey();
    const { data: account } = await supabase
      .from("paper_accounts")
      .select("demo_reset_date")
      .eq("user_id", userId)
      .maybeSingle();
    if (account && account.demo_reset_date === today) return { isDemo: true, reset: false };

    // A hard wipe, not a simulated market close: the point of the demo
    // profile is a clean slate, not a realistic trade log. Order matters
    // only in that `paper_accounts` is written last, so a failure partway
    // through leaves stale positions/orders behind (caught by the next
    // request) rather than cash reset with no matching cleanup.
    await Promise.all([
      supabase.from("positions").delete().eq("user_id", userId),
      supabase.from("orders").delete().eq("user_id", userId),
      supabase.from("protocol_exits").delete().eq("user_id", userId),
      supabase.from("trade_logs").delete().eq("user_id", userId),
    ]);

    await supabase.from("paper_accounts").upsert(
      {
        user_id: userId,
        cash: STARTING_CASH,
        demo_reset_date: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return { isDemo: true, reset: true };
  } catch {
    return NOT_DEMO;
  }
}
