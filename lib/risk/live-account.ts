/**
 * Reads a user's real net liquidation value from a connected *live*
 * brokerage — the only account this risk engine may ever gate, per the spec
 * pack: "these rules do not apply for paper trading". Paper/simulated
 * equity (`lib/guided/service.ts` `readGuidedAccount`, `lib/brokers/
 * simulator.ts`) must never be passed into `lib/risk/service.ts`.
 *
 * Alpaca live is read first and preferred when connected: it is the account
 * that `lib/trade/place-order.ts`'s live branch actually submits orders
 * against (via `lib/brokers/live-creds.ts`), so it is the equity the risk
 * gate must size against. SnapTrade is a fallback for a user who has only
 * linked a read-only external brokerage — informational, since nothing in
 * this app submits an order through SnapTrade.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson } from "@/lib/crypto";
import { isSnapTradeEnabled, listAccounts } from "@/lib/brokers/snaptrade";
import { getAccount } from "@/lib/brokers/alpaca";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";

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
  const alpaca = await readLiveAlpacaConnection(supabase, userId);
  if (alpaca) {
    try {
      const account = await getAccount(alpaca.creds);
      const equity = Number(account.equity);
      if (!Number.isFinite(equity)) return UNREADABLE;
      return { connected: true, equity, verified: true };
    } catch (err) {
      console.error(`risk: live Alpaca account value not readable — ${err instanceof Error ? err.message : String(err)}`);
      return UNREADABLE;
    }
  }

  const { data } = await supabase
    .from("broker_connections")
    .select("provider, credentials")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("provider", ["alpaca_live", "snaptrade"]);

  const rows = (data ?? []) as ConnectionRow[];
  if (rows.length === 0) return NOT_CONNECTED;

  const snaptrade = rows.find((r) => r.provider === "snaptrade");
  if (!snaptrade) return UNREADABLE; // only an unreadable alpaca_live row present

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
