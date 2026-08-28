/**
 * Reads a user's real net liquidation value from a connected *live*
 * brokerage — the only account this risk engine may ever gate, per the spec
 * pack: "these rules do not apply for paper trading". Paper/simulated
 * equity (`lib/guided/service.ts` `readGuidedAccount`, `lib/brokers/
 * simulator.ts`) must never be passed into `lib/risk/service.ts`.
 *
 * SnapTrade is the only linked-brokerage provider with a working balance
 * read today (`lib/brokers/snaptrade.ts` `listAccounts`) — `alpaca_live` is
 * a recognised `broker_connections.provider` value elsewhere in the app
 * (e.g. `lib/guided/service.ts` `hasLiveBrokerage`) but there is no code
 * path yet that fetches a live Alpaca account's balance per-user. Per the
 * spec's "If broker/account data is unavailable or stale, fail closed",
 * an `alpaca_live` connection with no reader is reported `connected: true,
 * verified: false, equity: 0` rather than guessed at — the caller must
 * treat that as "cannot size", not as "zero equity is the true balance".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson } from "@/lib/crypto";
import { isSnapTradeEnabled, listAccounts } from "@/lib/brokers/snaptrade";

export interface LiveAccountRead {
  /** True when any live/linked-brokerage `broker_connections` row exists and is active. */
  connected: boolean;
  /** Summed net liquidation value across every linked account. 0 when not connected or not readable. */
  equity: number;
  /** True only when `equity` came from a real broker read this call. */
  verified: boolean;
}

const UNREADABLE: LiveAccountRead = { connected: true, equity: 0, verified: false };
const NOT_CONNECTED: LiveAccountRead = { connected: false, equity: 0, verified: false };

interface ConnectionRow {
  provider: string;
  credentials: { enc: string };
}

export async function readLiveAccountValue(
  supabase: SupabaseClient,
  userId: string,
): Promise<LiveAccountRead> {
  const { data } = await supabase
    .from("broker_connections")
    .select("provider, credentials")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("provider", ["alpaca_live", "snaptrade"]);

  const rows = (data ?? []) as ConnectionRow[];
  if (rows.length === 0) return NOT_CONNECTED;

  const snaptrade = rows.find((r) => r.provider === "snaptrade");
  if (!snaptrade) return UNREADABLE; // only alpaca_live rows present — no reader yet, see header

  if (!isSnapTradeEnabled()) return UNREADABLE;

  try {
    const { userSecret } = decryptJson<{ userSecret: string }>(snaptrade.credentials.enc);
    const accounts = await listAccounts(userId, userSecret);
    const equity = accounts.reduce((sum, a) => sum + (a.balance?.total?.amount ?? 0), 0);
    return { connected: true, equity, verified: true };
  } catch (err) {
    console.error(`risk: live account value not readable — ${err instanceof Error ? err.message : String(err)}`);
    return UNREADABLE;
  }
}
