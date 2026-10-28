import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDailyPlans } from "@/lib/scanner/dailyPlans";

type Row = Record<string, unknown>;

/** Answers the query shapes `loadDailyPlans` issues. */
function fakeDb(tables: Record<string, Row[]>) {
  function from(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let order: { col: string; asc: boolean } | null = null;
    let limit = Infinity;
    let head = false;
    const result = () => {
      let data = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
      if (head) return { data: null, count: data.length, error: null };
      if (order) {
        const { col, asc } = order;
        data = [...data].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: data.slice(0, limit), error: null };
    };
    const chain = {
      select: (_cols?: string, opts?: { head?: boolean }) => ((head = opts?.head === true), chain),
      is: (col: string, val: unknown) => (filters.push((r) => (val === null ? r[col] == null : r[col] === val)), chain),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), chain),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), chain),
      gte: (col: string, val: string) => (filters.push((r) => String(r[col]) >= val), chain),
      not: (col: string, op: string, val: unknown) =>
        (filters.push((r) => (op === "is" && val === null ? r[col] != null : r[col] !== val)), chain),
      order: (col: string, opts: { ascending: boolean }) => ((order = { col, asc: opts.ascending }), chain),
      limit: (n: number) => ((limit = n), chain),
      maybeSingle: async () => ({ data: result().data?.[0] ?? null, error: null }),
      then: (resolve: (v: ReturnType<typeof result>) => void) => resolve(result()),
    };
    return chain;
  }
  return { from } as unknown as SupabaseClient;
}

const today = new Date().toISOString();
const plan = (scan_date: string, symbol: string, entry: number) => ({
  scan_date,
  symbol,
  direction: "bullish",
  entry,
  stop_loss: entry - 10,
  take_profit_1: entry + 20,
  master_profit: entry + 40,
  output_state: "Execute",
  updated_at: today,
});

describe("loadDailyPlans", () => {
  it("reads the lists from their latest scan date only: a plan the latest scan dropped is not the symbol's plan", async () => {
    const db = fakeDb({
      daily_scans: [plan("2026-10-19", "AMD", 480), plan("2026-10-21", "SPY", 670)],
      active_monitors: [],
    });
    const plans = await loadDailyPlans(db, ["AMD", "SPY"], null);
    expect([...plans.keys()]).toEqual(["SPY"]);
    expect(plans.get("SPY")).toMatchObject({ direction: "up", verdict: "Execute", entry: 670, stop: 660 });
  });

  it("carries whether the plan's crossing is made, from either source, and null when the row does not say", async () => {
    const db = fakeDb({
      daily_scans: [
        { ...plan("2026-10-21", "SPY", 670), awaits: true },
        { ...plan("2026-10-21", "QQQ", 600), awaits: false },
        plan("2026-10-21", "IWM", 250),
      ],
      active_monitors: [
        {
          symbol: "DIA", direction: "bearish", entry: 450, stop_loss: 460, take_profit_1: 430, master_profit: 410,
          output_state: "Watch", last_evaluated_at: today, entry_awaits_crossing: true, state: "WATCH",
        },
      ],
    });
    const plans = await loadDailyPlans(db, ["SPY", "QQQ", "IWM", "DIA"], null);
    expect(plans.get("SPY")?.awaitsCrossing).toBe(true);
    expect(plans.get("QQQ")?.awaitsCrossing).toBe(false);
    expect(plans.get("IWM")?.awaitsCrossing).toBeNull();
    expect(plans.get("DIA")?.awaitsCrossing).toBe(true);
  });

  it("reads the night's sweep as a plan only for the intraday scan, never one the session broke or the lists read since", async () => {
    const basis = "2026-10-28";
    const sweptAt = new Date(Date.now() - 3_600_000).toISOString();
    const earlier = new Date(Date.now() - 7_200_000).toISOString();
    const sweepRow = (symbol: string, extra: Row = {}) => ({
      basis_date: basis, symbol, direction: "bullish", entry: 100, stop_loss: 95, take_profit_1: 110, master_profit: 120,
      output_state: "Execute", swept_at: sweptAt, entry_awaits_crossing: false, invalidated_at: null, ...extra,
    });
    const db = fakeDb({
      universe_sweep: [
        sweepRow("DE"),
        sweepRow("BRK", { invalidated_at: today }),
        sweepRow("REJ"),
        sweepRow("OLD", { stop_loss: null }),
        sweepRow("STALE"),
        sweepRow("NEWER"),
        sweepRow("OTHER", { basis_date: "2026-10-27" }),
      ],
      daily_scans: [
        { ...plan("2026-10-21", "REJ", 50), output_state: "Reject", updated_at: today },
        // a list read before the sweep: the sweep stands
        { ...plan("2026-10-21", "STALE", 50), updated_at: earlier },
        // a list read after it: the list's own plan
        { ...plan("2026-10-21", "NEWER", 70), updated_at: today },
      ],
      active_monitors: [],
    });
    const all = ["DE", "BRK", "REJ", "OLD", "STALE", "NEWER", "OTHER"];
    const plans = await loadDailyPlans(db, all, null, { sweepBasis: basis });
    expect([...plans.keys()].sort()).toEqual(["DE", "NEWER", "STALE"]);
    expect(plans.get("DE")).toMatchObject({ direction: "up", verdict: "Execute", entry: 100, stop: 95, tp1: 110, mtp: 120, awaitsCrossing: false });
    expect(plans.get("STALE")).toMatchObject({ entry: 100 });
    expect(plans.get("NEWER")).toMatchObject({ entry: 70 });
    // The evening focus list passes no night: no sweep plans.
    expect([...(await loadDailyPlans(db, all, null)).keys()].sort()).toEqual(["NEWER", "STALE"]);
  });
});
