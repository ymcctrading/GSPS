/**
 * Per-user live Alpaca credentials.
 *
 * `lib/brokers/alpaca.ts`'s `envCreds("live")` is the app-level default (an
 * operator's own live keys, if ever set) — trading real orders against a
 * user's own money needs *their* keys, stored per-user in
 * `broker_connections` the same way SnapTrade's are (encrypted at rest via
 * `lib/crypto.ts`; see `lib/brokers/snaptrade.ts` for the identical pattern).
 * `lib/trade/exit-manager.ts`, `lib/portfolio/reconcile.ts`, and
 * `lib/portfolio/trade-log-settle.ts` were all written to accept an
 * `AlpacaCreds` — this is what resolves one for a specific user rather than
 * from the environment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson } from "@/lib/crypto";
import type { AlpacaCreds } from "@/lib/brokers/alpaca";

export interface LiveAlpacaConnection {
  connectionId: string;
  creds: AlpacaCreds;
}

interface ConnectionRow {
  id: string;
  credentials: { enc: string };
}

/**
 * The user's active `alpaca_live` connection, decrypted and ready to trade
 * with — or `null` when there isn't one, it's disabled, or it can't be
 * decrypted. A decrypt failure is logged and treated the same as "not
 * connected" rather than thrown: every caller of this must fail closed on a
 * live order, never guess at credentials it couldn't actually read.
 */
export async function readLiveAlpacaConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<LiveAlpacaConnection | null> {
  const { data } = await supabase
    .from("broker_connections")
    .select("id, credentials")
    .eq("user_id", userId)
    .eq("provider", "alpaca_live")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const row = data as ConnectionRow | null;
  if (!row) return null;

  try {
    const { key, secret } = decryptJson<{ key: string; secret: string }>(row.credentials.enc);
    if (!key || !secret) return null;
    return { connectionId: row.id, creds: { key, secret, mode: "live" } };
  } catch (err) {
    console.error(
      `live-creds: alpaca_live connection ${row.id} for user ${userId} couldn't be decrypted — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
