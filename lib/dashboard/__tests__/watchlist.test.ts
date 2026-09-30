import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DASHBOARD_WATCHLIST_MAX,
  DASHBOARD_WATCHLIST_MIN,
  DASHBOARD_WATCHLIST_NAME,
  getDashboardWatchlist,
  isCryptoWatchSymbol,
  isWatchSymbolFormat,
  normalizeDashboardWatchlist,
  resetDashboardWatchlist,
  saveDashboardWatchlist,
} from "@/lib/dashboard/watchlist";
import { DEFAULTS } from "@/lib/sectors";

describe("normalizeDashboardWatchlist", () => {
  it("upper-cases, trims and keeps the order the user chose", () => {
    const result = normalizeDashboardWatchlist([" nvda ", "aapl", "BTC/usd"]);
    expect(result).toEqual({ ok: true, symbols: ["NVDA", "AAPL", "BTC/USD"] });
  });

  it("drops repeats (first one wins) and blanks before counting", () => {
    const result = normalizeDashboardWatchlist(["AAPL", "MSFT", "aapl", "", "  ", "NVDA"]);
    expect(result).toEqual({ ok: true, symbols: ["AAPL", "MSFT", "NVDA"] });
  });

  it(`refuses fewer than ${DASHBOARD_WATCHLIST_MIN}`, () => {
    const result = normalizeDashboardWatchlist(["AAPL", "MSFT"]);
    expect(result).toEqual({ ok: false, error: `Keep at least ${DASHBOARD_WATCHLIST_MIN} symbols on the list.` });
    // Repeats don't pad the count.
    expect(normalizeDashboardWatchlist(["AAPL", "AAPL", "MSFT"]).ok).toBe(false);
  });

  it(`accepts exactly ${DASHBOARD_WATCHLIST_MIN} and exactly ${DASHBOARD_WATCHLIST_MAX}, refuses more`, () => {
    const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "SPY", "QQQ", "IWM"];
    expect(normalizeDashboardWatchlist(symbols.slice(0, DASHBOARD_WATCHLIST_MIN)).ok).toBe(true);
    expect(normalizeDashboardWatchlist(symbols.slice(0, DASHBOARD_WATCHLIST_MAX)).ok).toBe(true);
    expect(normalizeDashboardWatchlist(symbols.slice(0, DASHBOARD_WATCHLIST_MAX + 1))).toEqual({
      ok: false,
      error: `Keep the list to ${DASHBOARD_WATCHLIST_MAX} symbols or fewer.`,
    });
  });

  it("refuses a symbol in a format the watchlist tables can't hold, naming it", () => {
    // EUR/USD has the shape of a crypto pair but is forex.
    for (const bad of ["EUR/USD", "C:EURUSD", "TOOLONGX", "AA PL", "12345", "BTC/EUR", "$SPY"]) {
      expect(normalizeDashboardWatchlist(["AAPL", "MSFT", bad]).ok, bad).toBe(false);
    }
    const result = normalizeDashboardWatchlist(["AAPL", "MSFT", "$SPY"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"$SPY"');
  });

  it("accepts share classes and crypto pairs", () => {
    expect(normalizeDashboardWatchlist(["BRK.B", "BF-B", "ETH/USD"])).toEqual({
      ok: true,
      symbols: ["BRK.B", "BF-B", "ETH/USD"],
    });
  });

  it("refuses anything that isn't a list of text", () => {
    expect(normalizeDashboardWatchlist("AAPL,MSFT,NVDA").ok).toBe(false);
    expect(normalizeDashboardWatchlist(null).ok).toBe(false);
    expect(normalizeDashboardWatchlist(["AAPL", 1, "MSFT"]).ok).toBe(false);
  });
});

describe("symbol formats", () => {
  it("tells crypto pairs from equities", () => {
    expect(isCryptoWatchSymbol("BTC/USD")).toBe(true);
    expect(isCryptoWatchSymbol("AAPL")).toBe(false);
    expect(isWatchSymbolFormat("BTC/USD")).toBe(true);
    expect(isWatchSymbolFormat("btc")).toBe(false); // callers upper-case first
  });
});

/**
 * A recording stand-in for the parts of the Supabase client these functions use.
 * Each `from(table)` call returns a chain whose terminal calls resolve to the
 * scripted result for that table, and every call is written to `log`.
 */
function fakeSupabase(script: Record<string, { data?: unknown; error?: { message: string } | null }[]>) {
  const log: { table: string; op: string; args: unknown[] }[] = [];
  const queues = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]));
  const next = (table: string) => queues.get(table)?.shift() ?? { data: null, error: null };

  function chain(table: string) {
    const c: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(next(table));
    for (const method of ["select", "eq", "order", "limit", "not", "in", "insert", "upsert", "delete"]) {
      c[method] = (...args: unknown[]) => {
        log.push({ table, op: method, args });
        return c;
      };
    }
    c.maybeSingle = resolve;
    c.single = resolve;
    c.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return c;
  }
  const client = { from: (table: string) => chain(table) } as unknown as SupabaseClient;
  return { client, log };
}

describe("getDashboardWatchlist", () => {
  it("returns the platform default when the account has never saved a list", async () => {
    const { client } = fakeSupabase({ watchlists: [{ data: null }] });
    expect(await getDashboardWatchlist(client, "u1")).toEqual({ symbols: [...DEFAULTS], isDefault: true });
  });

  it("returns the saved symbols in the order they were stamped", async () => {
    const { client } = fakeSupabase({
      watchlists: [{ data: { id: "w1" } }],
      watchlist_items: [{ data: [{ symbol: "NVDA" }, { symbol: "AAPL" }, { symbol: "BTC/USD" }] }],
    });
    expect(await getDashboardWatchlist(client, "u1")).toEqual({ symbols: ["NVDA", "AAPL", "BTC/USD"], isDefault: false });
  });

  it("falls back to the default for a list outside 3–9 (a partial write, a hand-edited row)", async () => {
    const tooFew = fakeSupabase({
      watchlists: [{ data: { id: "w1" } }],
      watchlist_items: [{ data: [{ symbol: "NVDA" }, { symbol: "AAPL" }] }],
    });
    expect((await getDashboardWatchlist(tooFew.client, "u1")).isDefault).toBe(true);

    const tooMany = fakeSupabase({
      watchlists: [{ data: { id: "w1" } }],
      watchlist_items: [{ data: Array.from({ length: DASHBOARD_WATCHLIST_MAX + 1 }, (_, i) => ({ symbol: `S${i}` })) }],
    });
    expect((await getDashboardWatchlist(tooMany.client, "u1")).isDefault).toBe(true);
  });

  it("reads only this user's list, by name", async () => {
    const { client, log } = fakeSupabase({ watchlists: [{ data: null }] });
    await getDashboardWatchlist(client, "u1");
    expect(log).toContainEqual({ table: "watchlists", op: "eq", args: ["user_id", "u1"] });
    expect(log).toContainEqual({ table: "watchlists", op: "eq", args: ["name", DASHBOARD_WATCHLIST_NAME] });
  });
});

describe("saveDashboardWatchlist", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("upserts every symbol first with an increasing timestamp, then removes the ones no longer on the list", async () => {
    const { client, log } = fakeSupabase({
      watchlists: [{ data: { id: "w1" } }],
      watchlist_items: [{ error: null }, { error: null }],
    });
    await saveDashboardWatchlist(client, "u1", ["NVDA", "BTC/USD", "AAPL"], now);

    const upsert = log.find((l) => l.op === "upsert");
    expect(upsert?.args[0]).toEqual([
      { watchlist_id: "w1", symbol: "NVDA", asset_class: "us_equity", added_at: "2026-09-30T12:00:00.000Z" },
      { watchlist_id: "w1", symbol: "BTC/USD", asset_class: "crypto", added_at: "2026-09-30T12:00:00.001Z" },
      { watchlist_id: "w1", symbol: "AAPL", asset_class: "us_equity", added_at: "2026-09-30T12:00:00.002Z" },
    ]);
    expect(upsert?.args[1]).toEqual({ onConflict: "watchlist_id,symbol" });

    const order = log.map((l) => l.op).filter((op) => op === "upsert" || op === "delete");
    expect(order).toEqual(["upsert", "delete"]);
    expect(log.find((l) => l.op === "not")?.args).toEqual(["symbol", "in", '("NVDA","BTC/USD","AAPL")']);
  });

  it("creates the list the first time", async () => {
    const { client, log } = fakeSupabase({
      watchlists: [{ data: null }, { data: { id: "new" } }],
      watchlist_items: [{ error: null }, { error: null }],
    });
    await saveDashboardWatchlist(client, "u1", ["AAPL", "MSFT", "NVDA"], now);
    expect(log.find((l) => l.table === "watchlists" && l.op === "insert")?.args[0]).toEqual({
      user_id: "u1",
      name: DASHBOARD_WATCHLIST_NAME,
    });
    expect(log.find((l) => l.op === "upsert")?.args[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ watchlist_id: "new" })]),
    );
  });

  it("leaves the previous symbols in place when the upsert fails, rather than deleting first", async () => {
    const { client, log } = fakeSupabase({
      watchlists: [{ data: { id: "w1" } }],
      watchlist_items: [{ error: { message: "boom" } }],
    });
    await expect(saveDashboardWatchlist(client, "u1", ["AAPL", "MSFT", "NVDA"], now)).rejects.toThrow("boom");
    expect(log.some((l) => l.op === "delete")).toBe(false);
  });
});

describe("resetDashboardWatchlist", () => {
  it("clears the saved items so the reader falls through to the default", async () => {
    const { client, log } = fakeSupabase({
      watchlists: [{ data: [{ id: "w1" }] }],
      watchlist_items: [{ error: null }],
    });
    await resetDashboardWatchlist(client, "u1");
    expect(log.find((l) => l.table === "watchlist_items" && l.op === "delete")).toBeDefined();
    expect(log.find((l) => l.table === "watchlist_items" && l.op === "in")?.args).toEqual(["watchlist_id", ["w1"]]);
  });

  it("does nothing when there is no list", async () => {
    const { client, log } = fakeSupabase({ watchlists: [{ data: [] }] });
    await resetDashboardWatchlist(client, "u1");
    expect(log.some((l) => l.table === "watchlist_items")).toBe(false);
  });
});
