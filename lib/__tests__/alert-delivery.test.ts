/**
 * Alert delivery, end to end over an in-memory database (roadmap item 15).
 * CI has no test Supabase project, so this drives the real delivery code
 * against a fake client that answers the query shapes it issues.
 *
 * This half covers the intraday bell (`recordIntradayBells`): who receives a
 * new intraday signal, by watchlist, monitor and tier, and that a signal
 * still standing is not written twice the same day.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";

const { tierByUser } = vi.hoisted(() => ({ tierByUser: new Map<string, "novice" | "pro" | "expert">() }));

vi.mock("@/lib/entitlements/policy", () => ({
  getUserEntitlementPolicy: async (_client: unknown, userId: string) => {
    const tier = tierByUser.get(userId) ?? "novice";
    return {
      intradayScansEnabled: tier === "expert",
      proIntradayModuleEnabled: tier === "pro",
    };
  },
}));

import { recordIntradayBells } from "@/lib/notifications/intradayBell";

type Row = Record<string, unknown>;

/**
 * The query shapes the bell path issues: select with eq/in/gte/is filters,
 * an inner join of watchlist_items to watchlists, and insert.
 */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  const rows = (name: string) => (tables[name] ??= []);

  function from(name: string) {
    return {
      select(columns: string) {
        const filters: ((r: Row) => boolean)[] = [];
        const result = () => {
          let data = rows(name).filter((r) => filters.every((f) => f(r)));
          if (name === "watchlist_items" && columns.includes("watchlists!inner")) {
            data = data
              .map((r) => ({ ...r, watchlists: rows("watchlists").find((w) => w.id === r.watchlist_id) }))
              .filter((r) => r.watchlists);
          }
          return { data, error: null };
        };
        const chain = {
          eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), chain),
          in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), chain),
          gte: (col: string, val: string) => (filters.push((r) => String(r[col]) >= val), chain),
          is: (col: string, val: null) => (filters.push((r) => (r[col] ?? null) === val), chain),
          then: (resolve: (v: ReturnType<typeof result>) => void) => resolve(result()),
        };
        return chain;
      },
      insert(input: Row | Row[]) {
        const list = Array.isArray(input) ? input : [input];
        for (const r of list) rows(name).push({ id: `${name}-${rows(name).length + 1}`, created_at: now.toISOString(), ...r });
        return Promise.resolve({ error: null });
      },
    };
  }

  return { client: { from } as unknown as SupabaseClient, tables };
}

let now = new Date("2026-10-21T15:30:00Z");

function alert(symbol: string, over: Partial<Alert> = {}): Alert {
  return {
    symbol,
    type: "old_level_cross",
    direction: "up",
    move: { current: 770 },
    invalidation: 760,
    continuationPlan: { firstTarget: 790, masterTarget: null, paysRisk: true },
    ...over,
  } as unknown as Alert;
}

const seed = () => ({
  watchlists: [
    { id: "wl-a", user_id: "expert-a" },
    { id: "wl-c", user_id: "novice-c" },
    { id: "wl-d", user_id: "expert-d" },
    { id: "wl-p", user_id: "pro-p" },
  ],
  watchlist_items: [
    { watchlist_id: "wl-a", symbol: "SPY" },
    { watchlist_id: "wl-c", symbol: "SPY" },
    { watchlist_id: "wl-d", symbol: "TSLA" },
    { watchlist_id: "wl-p", symbol: "SPY" },
  ],
  active_monitors: [
    { profile_id: "expert-b", symbol: "SPY", state: "EXECUTE" },
    { profile_id: "expert-e", symbol: "SPY", state: "INVALIDATED" },
  ],
  in_app_notifications: [] as Row[],
});

beforeEach(() => {
  now = new Date("2026-10-21T15:30:00Z");
  tierByUser.clear();
  for (const [u, t] of [
    ["expert-a", "expert"],
    ["expert-b", "expert"],
    ["novice-c", "novice"],
    ["expert-d", "expert"],
    ["expert-e", "expert"],
    ["pro-p", "pro"],
  ] as const) {
    tierByUser.set(u, t);
  }
});

const recipients = (rows: Row[]) => [...new Set(rows.map((r) => r.profile_id as string))].sort();

describe("intraday bell delivery", () => {
  it("reaches members watching the symbol, by watchlist or open monitor, with intraday access", async () => {
    const db = fakeDb(seed());
    const written = await recordIntradayBells(db.client, [alert("SPY")], {
      intervalBySymbol: new Map([["SPY", 1]]),
      now,
    });
    // Novice has no intraday; Pro's module takes 1-minute bars as unconfirmed;
    // a closed monitor and another symbol's watcher get nothing.
    expect(recipients(db.tables.in_app_notifications)).toEqual(["expert-a", "expert-b"]);
    expect(written).toBe(2);
    const row = db.tables.in_app_notifications[0];
    expect(row).toMatchObject({ symbol: "SPY", verdict: "Intraday", transition_id: null });
    expect(String(row.title)).toContain("SPY intraday, up");
  });

  it("reaches Pro's bounded module only on a confirmed bar length", async () => {
    const db = fakeDb(seed());
    await recordIntradayBells(db.client, [alert("SPY")], {
      intervalBySymbol: new Map([["SPY", 15]]),
      now,
    });
    expect(recipients(db.tables.in_app_notifications)).toEqual(["expert-a", "expert-b", "pro-p"]);
  });

  it("writes a standing signal once a day, again after it turns the other way, and on a new day", async () => {
    const db = fakeDb(seed());
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    await recordIntradayBells(db.client, [alert("SPY")], args);
    // Still standing past the scanner's 30-minute cooldown: no repeat (2026-10-26 had 4,515 notices for 1,115 pairs).
    now = new Date("2026-10-21T16:05:00Z");
    expect(await recordIntradayBells(db.client, [alert("SPY")], { ...args, now })).toBe(0);
    now = new Date("2026-10-21T19:50:00Z");
    expect(await recordIntradayBells(db.client, [alert("SPY")], { ...args, now })).toBe(0);
    // Turned down, then up again: each turn is a new move.
    now = new Date("2026-10-21T20:00:00Z");
    expect(await recordIntradayBells(db.client, [alert("SPY", { direction: "down" })], { ...args, now })).toBe(2);
    now = new Date("2026-10-21T20:15:00Z");
    expect(await recordIntradayBells(db.client, [alert("SPY")], { ...args, now })).toBe(2);
    // The next New York session starts afresh.
    now = new Date("2026-10-22T14:00:00Z");
    expect(await recordIntradayBells(db.client, [alert("SPY")], { ...args, now })).toBe(2);
    expect(db.tables.in_app_notifications).toHaveLength(8);
  });

  it("writes a notice at a plan's entry once in 12 hours, as before", async () => {
    const db = fakeDb(seed());
    const reached = alert("SPY", { type: "entry_reached" } as Partial<Alert>);
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    // Notices reach Pro's module too, outside its bound.
    expect(await recordIntradayBells(db.client, [reached], args)).toBe(3);
    expect(recipients(db.tables.in_app_notifications)).toEqual(["expert-a", "expert-b", "pro-p"]);
    now = new Date("2026-10-21T19:00:00Z");
    expect(await recordIntradayBells(db.client, [reached], { ...args, now })).toBe(0);
    now = new Date("2026-10-22T04:00:00Z");
    expect(await recordIntradayBells(db.client, [reached], { ...args, now })).toBe(3);
  });

  it("keeps different signals on one symbol apart", async () => {
    const db = fakeDb(seed());
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    await recordIntradayBells(db.client, [alert("SPY")], args);
    expect(await recordIntradayBells(db.client, [alert("SPY", { type: "trend_continuation" } as Partial<Alert>)], args)).toBe(2);
  });

  it("treats the other direction as a new signal", async () => {
    const db = fakeDb(seed());
    const args = { intervalBySymbol: new Map([["SPY", 1]]), now };
    await recordIntradayBells(db.client, [alert("SPY")], args);
    expect(await recordIntradayBells(db.client, [alert("SPY", { direction: "down" })], args)).toBe(2);
  });

  it("keeps Pro's notices within its daily bound of setups, by symbol", async () => {
    const symbols = ["SPY", "QQQ", "IWM", "DIA", "TSLA", "NVDA", "AAPL"];
    const db = fakeDb({
      watchlists: [{ id: "wl-p", user_id: "pro-p" }],
      watchlist_items: symbols.map((symbol) => ({ watchlist_id: "wl-p", symbol })),
      active_monitors: [],
      in_app_notifications: [],
    });
    const intervalBySymbol = new Map(symbols.map((s) => [s, 15]));
    const written = await recordIntradayBells(db.client, symbols.map((s) => alert(s)), {
      intervalBySymbol,
      now,
    });
    // DEFAULT_PRO_INTRADAY_POLICY.setupsDisplayedPerDayMax is 5.
    expect(written).toBe(5);
    // A new signal on a symbol already noticed today still reaches them; a sixth symbol does not.
    now = new Date("2026-10-21T16:30:00Z");
    expect(
      await recordIntradayBells(db.client, [alert("SPY", { direction: "down" }), alert("AAPL")], {
        intervalBySymbol,
        now,
      }),
    ).toBe(1);
  });

  it("writes nothing when no member watches the symbol", async () => {
    const db = fakeDb(seed());
    const written = await recordIntradayBells(db.client, [alert("NVDA")], {
      intervalBySymbol: new Map(),
      now,
    });
    expect(written).toBe(0);
    expect(db.tables.in_app_notifications).toHaveLength(0);
  });
});
