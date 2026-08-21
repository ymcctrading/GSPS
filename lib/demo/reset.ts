/**
 * GSPS — showcase demo profile identification.
 *
 * `profiles.is_demo` marks the one account shown to prospective investors,
 * partners, teammates, and prospects. It used to also mean "wipe this
 * account's trades and cash back to a clean $100,000 slate on the first
 * visit each trading day" — that's gone. The demo account now trades for
 * real, on a schedule, via `lib/demo/auto-trade.ts`, and its balance and
 * history are meant to compound and accumulate exactly like any other
 * account: profit becomes real usable capital for the next trade, and a
 * consistent winner earns a bigger allocation over time. Wiping any of that
 * nightly would have thrown away the very thing an automated demo account
 * exists to show off.
 *
 * The only thing that still resets on a visit is the first-run tour — see
 * `app/api/onboarding/route.ts`, which calls `isDemoAccount` to force it to
 * show every time, regardless of what `settings.prefs.onboarding` says was
 * seen before.
 */

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Fails closed: a read error is treated as "not the demo account" rather
 * than surfaced, since this runs inline on an ordinary page load that has
 * nothing to do with demo upkeep — the cost of guessing wrong here is a
 * tour that doesn't reopen for the demo account once, not a broken request
 * for anyone else.
 */
export async function isDemoAccount(supabase: Supabase, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from("profiles").select("is_demo").eq("id", userId).maybeSingle();
    return data?.is_demo === true;
  } catch {
    return false;
  }
}
