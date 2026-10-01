/**
 * The Dashboard's "Default watchlist" — the row of symbols under the setups,
 * one tap from a full scan — made the user's own (project owner, 2026-09-30):
 * at least 3 symbols and at most 9, saved per account.
 *
 * Stored in the `watchlists` / `watchlist_items` tables migration 0001 created
 * and nothing had used until now (RLS: a user reaches only their own rows), as
 * one list named `DASHBOARD_WATCHLIST_NAME`, so no new table or migration is
 * needed. Order is kept in `added_at` (the table has no position column): each
 * save stamps the symbols an increasing millisecond apart.
 *
 * One consequence worth knowing: `app/api/intraday-scan/route.ts` merges every
 * user's watchlist symbols into the system intraday scan's universe (capped at
 * 50 total, most-watched first, after the curated list). A symbol added here can
 * therefore be covered by that scan too. That is the existing behaviour of those
 * tables, and it is the reason this list is restricted to the two asset classes
 * `watchlist_items.asset_class` allows (US equities and crypto).
 *
 * With no saved list, or one outside 3–9 (a partial write, a hand-edited row),
 * the reader returns the platform default — `DEFAULTS`, the Magnificent Seven,
 * SPY and BTC — so the card can never render empty.
 *
 * Three-question basis (AGENTS.md): (1) Gann: none — a personal shortcut list,
 * not a market technique. (2) Cycles: no periodicity claim. (3) Hermetic:
 * Polarity, the same call as the rest of this platform's Novice/Expert design —
 * a considered default for the person who wants one, and the whole choice for
 * the person who knows what they trade; 3 to 9 keeps it a glanceable row, not a
 * second watchlist page.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULTS } from "@/lib/sectors";

export const DASHBOARD_WATCHLIST_MIN = 3;
export const DASHBOARD_WATCHLIST_MAX = 9;
export const DASHBOARD_WATCHLIST_NAME = "Dashboard";

/** Equity tickers (`AAPL`, `BRK.B`) and crypto pairs (`BTC/USD`) — the only classes `watchlist_items` accepts. */
const EQUITY_FORMAT = /^[A-Z]{1,5}([.-][A-Z]{1,2})?$/;
const CRYPTO_FORMAT = /^[A-Z]{2,10}\/USD$/;

/**
 * A `BASE/USD` pair whose base is a national currency is forex, which the
 * watchlist tables can't hold (asset_class is us_equity or crypto) and which
 * would otherwise pass for a crypto pair by shape alone.
 */
const FIAT_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CAD", "CHF", "AUD", "NZD", "CNY", "CNH", "HKD", "SGD", "MXN", "SEK", "NOK", "DKK",
  "ZAR", "INR", "KRW", "TRY", "BRL", "PLN",
]);

export function isCryptoWatchSymbol(symbol: string): boolean {
  return CRYPTO_FORMAT.test(symbol) && !FIAT_CODES.has(symbol.split("/")[0]);
}

/** Whether an (already upper-cased) symbol is in a format the list can hold. */
export function isWatchSymbolFormat(symbol: string): boolean {
  return EQUITY_FORMAT.test(symbol) || isCryptoWatchSymbol(symbol);
}

export function badSymbolMessage(symbol: string): string {
  return `"${symbol}" isn't a US stock or crypto symbol this list can hold. Use a ticker like AAPL or a pair like BTC/USD.`;
}

export type NormalizedWatchlist =
  | { ok: true; symbols: string[] }
  | { ok: false; error: string };

/**
 * Clean and validate a submitted list: uppercase, trimmed, de-duplicated (first
 * occurrence wins, so the user's order survives), each in a recognised format,
 * and between 3 and 9 symbols once de-duplicated.
 */
export function normalizeDashboardWatchlist(input: unknown): NormalizedWatchlist {
  if (!Array.isArray(input)) return { ok: false, error: "Send a list of symbols." };

  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, error: "Every symbol has to be text." };
    const symbol = raw.trim().toUpperCase();
    if (!symbol) continue;
    if (!isWatchSymbolFormat(symbol)) {
      return { ok: false, error: badSymbolMessage(symbol) };
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
  }

  if (symbols.length < DASHBOARD_WATCHLIST_MIN) {
    return { ok: false, error: `Keep at least ${DASHBOARD_WATCHLIST_MIN} symbols on the list.` };
  }
  if (symbols.length > DASHBOARD_WATCHLIST_MAX) {
    return { ok: false, error: `Keep the list to ${DASHBOARD_WATCHLIST_MAX} symbols or fewer.` };
  }
  return { ok: true, symbols };
}

export interface DashboardWatchlist {
  symbols: string[];
  /** True when the account has no saved list and this is the platform default. */
  isDefault: boolean;
}

function defaultWatchlist(): DashboardWatchlist {
  return { symbols: [...DEFAULTS], isDefault: true };
}

/** The saved list, or the platform default when there is none (or it is out of range). */
export async function getDashboardWatchlist(supabase: SupabaseClient, userId: string): Promise<DashboardWatchlist> {
  const { data: list } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DASHBOARD_WATCHLIST_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return defaultWatchlist();

  const { data: items } = await supabase
    .from("watchlist_items")
    .select("symbol, added_at")
    .eq("watchlist_id", list.id)
    .order("added_at", { ascending: true });

  const symbols = (items ?? []).map((i) => String(i.symbol));
  if (symbols.length < DASHBOARD_WATCHLIST_MIN || symbols.length > DASHBOARD_WATCHLIST_MAX) {
    return defaultWatchlist();
  }
  return { symbols, isDefault: false };
}

/**
 * Save a list already passed through `normalizeDashboardWatchlist`. Upserts every
 * symbol first (stamping the order), then removes the ones that are no longer
 * on it — so a failure part-way leaves the previous symbols in place rather than
 * an empty list. Throws on a database error.
 */
export async function saveDashboardWatchlist(
  supabase: SupabaseClient,
  userId: string,
  symbols: string[],
  now: Date = new Date(),
): Promise<void> {
  let listId: string;
  const { data: existing, error: findError } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DASHBOARD_WATCHLIST_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing) {
    listId = existing.id as string;
  } else {
    const { data: created, error: createError } = await supabase
      .from("watchlists")
      .insert({ user_id: userId, name: DASHBOARD_WATCHLIST_NAME })
      .select("id")
      .single();
    if (createError || !created) throw new Error(createError?.message ?? "Could not create the list.");
    listId = created.id as string;
  }

  const base = now.getTime();
  const rows = symbols.map((symbol, i) => ({
    watchlist_id: listId,
    symbol,
    asset_class: isCryptoWatchSymbol(symbol) ? "crypto" : "us_equity",
    added_at: new Date(base + i).toISOString(),
  }));
  const { error: upsertError } = await supabase
    .from("watchlist_items")
    .upsert(rows, { onConflict: "watchlist_id,symbol" });
  if (upsertError) throw new Error(upsertError.message);

  const { error: deleteError } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("watchlist_id", listId)
    .not("symbol", "in", `(${symbols.map((s) => `"${s}"`).join(",")})`);
  if (deleteError) throw new Error(deleteError.message);
}

/** Back to the platform default: drop the saved items so the reader falls through to `DEFAULTS`. */
export async function resetDashboardWatchlist(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: lists, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DASHBOARD_WATCHLIST_NAME);
  if (error) throw new Error(error.message);
  const ids = (lists ?? []).map((l) => l.id as string);
  if (ids.length === 0) return;
  const { error: deleteError } = await supabase.from("watchlist_items").delete().in("watchlist_id", ids);
  if (deleteError) throw new Error(deleteError.message);
}
