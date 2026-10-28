import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  barsSincePlan,
  brokenSweepSymbols,
  closedBreachBars,
  stopBreachStands,
  invalidateBrokenSweep,
  rankSessionSetups,
  type BreachBars,
  type ListRow,
  type SweepRow,
} from "@/lib/scanner/sessionSetups";

const list = (symbol: string, output_state: string, score: number, opts: Partial<ListRow> & { price?: number; range?: number } = {}): ListRow => ({
  symbol,
  direction: opts.direction ?? "bullish",
  score,
  output_state,
  entry: "entry" in opts ? (opts.entry ?? null) : 100,
  take_profit_1: 110,
  master_profit: 120,
  detail: { currentPrice: opts.price ?? 101, dayRange: opts.range ?? 3, ...(opts.detail ?? {}) },
});
const sweep = (symbol: string, output_state: string, score: number): SweepRow => ({ symbol, score, output_state });

describe("rankSessionSetups", () => {
  it("puts the lists' Execute first, then the sweep's Execute, then a Watch at the cutoff, each by score", () => {
    const ranked = rankSessionSetups(
      [list("AAA", "Execute", 7), list("BBB", "Execute", 9), list("CCC", "Watch", 8), list("DDD", "Watch", 6)],
      [sweep("EEE", "Execute", 7), sweep("FFF", "Execute", 9), sweep("GGG", "Watch", 9)],
    );
    expect(ranked).toEqual(["BBB", "AAA", "FFF", "EEE", "CCC"]);
  });

  it("leaves out a resting order, a retired plan, an expired plan and a Reject", () => {
    const ranked = rankSessionSetups(
      [
        list("REST", "Execute", 9, { entry: 80, price: 100, range: 3 }),
        list("RETIRED", "Execute", 9, { detail: { retired: true } }),
        list("EXPIRED", "Execute", 9, { detail: { planExpired: true } }),
        list("REJ", "Reject", 7),
        list("OK", "Execute", 7),
      ],
      [],
    );
    expect(ranked).toEqual(["OK"]);
  });

  it("lets the lists' later read stand over the sweep: a sweep Execute the lists now reject or hold resting is not timed", () => {
    const ranked = rankSessionSetups(
      [list("XXX", "Reject", 3), list("YYY", "Watch", 8, { entry: 50, price: 100 })],
      [sweep("XXX", "Execute", 9), sweep("YYY", "Execute", 9), sweep("ZZZ", "Execute", 7)],
    );
    expect(ranked).toEqual(["ZZZ"]);
  });

  it("reads a sell side's resting order from above price", () => {
    const sell = list("SHRT", "Execute", 8, { direction: "bearish", entry: 120, price: 100, range: 3 });
    expect(rankSessionSetups([sell], [])).toEqual([]);
    expect(rankSessionSetups([{ ...sell, entry: 102 }], [])).toEqual(["SHRT"]);
  });

  it("keeps a plan with no range read (nothing known, so not called resting), takes a symbol's better row, and caps the list", () => {
    const noRange = list("NOR", "Execute", 7, { detail: { dayRange: null } });
    const twice = [list("TWO", "Watch", 9), list("TWO", "Execute", 8)];
    expect(rankSessionSetups([noRange, ...twice], [])).toEqual(["TWO", "NOR"]);
    expect(rankSessionSetups([noRange, ...twice], [], 1)).toEqual(["TWO"]);
    expect(rankSessionSetups([noRange], [], 0)).toEqual([]);
  });

  it("lets the sweep stand when it is the later read (between the night's sweep and the day's first scan)", () => {
    const ranked = rankSessionSetups(
      [list("XXX", "Reject", 3), list("BTC/USD", "Execute", 7)],
      [sweep("XXX", "Execute", 9), sweep("YYY", "Watch", 5)],
      24,
      false,
    );
    expect(ranked).toEqual(["BTC/USD", "XXX"]);
  });

  it("leaves out a list row with no entry: there is no plan to time", () => {
    expect(rankSessionSetups([list("NOE", "Watch", 8, { entry: null }), list("NOX", "Execute", 8, { entry: null })], [])).toEqual([]);
  });

  it("leaves out a sweep Execute whose stop the session already traded through", () => {
    const broken: SweepRow = { ...sweep("BRK", "Execute", 9), invalidated_at: "2026-10-28T15:00:00Z" };
    expect(rankSessionSetups([], [broken, sweep("OK", "Execute", 7)])).toEqual(["OK"]);
  });
});

describe("the sweep's stop test", () => {
  const swept = "2026-10-28T08:00:00Z";
  const at = (t: string, h: number, l: number, c = (h + l) / 2) => ({ t, h, l, c });
  const now = Date.parse("2026-10-28T15:30:00Z"); // 11:30 New York
  const session = new Map<string, BreachBars>([
    // 10:15 ET: the low trades through the stop and the bar closes under the reclaim line
    ["BUY", { kind: "equity", bars: [at("2026-10-28T14:00:00Z", 102, 96, 100), at("2026-10-28T14:15:00Z", 101, 94.9, 95.5), at("2026-10-28T14:30:00Z", 96, 95.2, 95.5)] }],
    // a poke through the stop, then a closed bar back well past the reclaim line: Gann's failed break
    ["POKE", { kind: "equity", bars: [at("2026-10-28T14:15:00Z", 101, 94.5, 95.2), at("2026-10-28T14:30:00Z", 103, 95.5, 102.5), at("2026-10-28T14:45:00Z", 103, 102, 102.5)] }],
    ["HELD", { kind: "equity", bars: [at("2026-10-28T14:00:00Z", 102, 96, 100)] }],
    ["SELL", { kind: "equity", bars: [at("2026-10-28T15:00:00Z", 105, 99, 104.9), at("2026-10-28T15:15:00Z", 104.9, 104, 104.5)] }],
    // the feed stops inside a bucket: 10:00-10:15 has prints only to 10:04, so it is not closed yet
    ["LATE", { kind: "equity", bars: [at("2026-10-28T14:00:00Z", 101, 94, 94.5), at("2026-10-28T14:04:00Z", 95, 94, 94.2)] }],
    // 8:00 ET: a pre-market print never breaks a plan
    ["PRE", { kind: "equity", bars: [at("2026-10-28T12:00:00Z", 102, 80, 81), at("2026-10-28T14:00:00Z", 102, 96, 100)] }],
    // the session before the plan was priced (a holiday's scan) never breaks it
    ["OLDBARS", { kind: "equity", bars: [at("2026-10-27T15:00:00Z", 102, 80, 81)] }],
    // a bar printed after the read: it says nothing yet
    ["FORM", { kind: "equity", bars: [at("2026-10-28T15:31:00Z", 102, 80, 81)] }],
  ]);

  it("breaks a plan as the lists' scan reads a breach, after the plan, in the regular session, on closed bars", () => {
    expect(
      brokenSweepSymbols(
        [
          { symbol: "BUY", direction: "bullish", stop_loss: 95, swept_at: swept },
          { symbol: "POKE", direction: "bullish", stop_loss: 95, swept_at: swept },
          { symbol: "HELD", direction: "bullish", stop_loss: 95, swept_at: swept },
          { symbol: "SELL", direction: "bearish", stop_loss: "105", swept_at: swept },
          { symbol: "PRE", direction: "bullish", stop_loss: 90, swept_at: swept },
          { symbol: "OLDBARS", direction: "bullish", stop_loss: 90, swept_at: swept },
          { symbol: "FORM", direction: "bullish", stop_loss: 90, swept_at: swept },
          { symbol: "LATE", direction: "bullish", stop_loss: 95, swept_at: swept },
          { symbol: "NOSTOP", direction: "bullish", stop_loss: null, swept_at: swept },
          { symbol: "NOBARS", direction: "bullish", stop_loss: 1_000, swept_at: swept },
          { symbol: "HELD", direction: "none", stop_loss: 200, swept_at: swept },
        ],
        session,
        now,
      ),
    ).toEqual(["BUY", "SELL"]);
  });

  it("rolls the session's bars into closed 15-minute bars", () => {
    const bars = [
      at("2026-10-28T14:00:00Z", 101, 99, 100),
      at("2026-10-28T14:14:00Z", 103, 98, 102),
      at("2026-10-28T14:16:00Z", 110, 90, 95),
    ];
    // 14:16's bucket has no print past its end, so only 14:00's is closed, whatever the clock says
    expect(closedBreachBars(bars, Date.parse("2026-10-28T14:40:00Z"))).toEqual([{ h: 103, l: 98, c: 102 }]);
    expect(stopBreachStands("up", 95, bars, Date.parse("2026-10-28T14:40:00Z"))).toBe(false);
    const later = [...bars, at("2026-10-28T14:30:00Z", 96, 94, 95)];
    expect(stopBreachStands("up", 95, later, Date.parse("2026-10-28T14:40:00Z"))).toBe(true);
    // the clock still bounds it: nothing past now is read as closed
    expect(closedBreachBars(later, Date.parse("2026-10-28T14:20:00Z"))).toEqual([{ h: 103, l: 98, c: 102 }]);
  });

  it("closes a stock's last bucket once the session and the feed's delay have passed", () => {
    // 2026-10-28 is EDT: the session closes 20:00 UTC, the feed's delay and margin run to 20:20.
    const bars = [at("2026-10-28T19:30:00Z", 101, 99, 100), at("2026-10-28T19:46:00Z", 101, 90, 92), at("2026-10-28T19:55:00Z", 93, 91, 92)];
    expect(stopBreachStands("up", 95, bars, Date.parse("2026-10-28T20:17:00Z"), "equity")).toBe(false);
    expect(stopBreachStands("up", 95, bars, Date.parse("2026-10-28T20:21:00Z"), "equity")).toBe(true);
    // crypto has no session close: its bucket waits for a later print
    expect(stopBreachStands("up", 95, bars, Date.parse("2026-10-28T20:21:00Z"), "crypto")).toBe(false);
    // an early close ends at 1 PM (18:00 UTC in EST)
    const early = [at("2026-11-27T17:50:00Z", 93, 90, 92)];
    expect(closedBreachBars(early, Date.parse("2026-11-27T18:17:00Z"), "equity")).toHaveLength(0);
    expect(closedBreachBars(early, Date.parse("2026-11-27T18:21:00Z"), "equity")).toEqual([{ h: 93, l: 90, c: 92 }]);
    // a mid-session bucket still needs a later print
    expect(closedBreachBars([at("2026-10-28T15:00:00Z", 1, 0.5)], Date.parse("2026-10-28T20:21:00Z"), "equity")).toHaveLength(0);
  });

  it("ends an early close's session at 1 PM", () => {
    // 2026-11-27, the day after Thanksgiving: 1:30 PM New York is after the close.
    const bars = [at("2026-11-27T18:30:00Z", 1, 0.5)];
    expect(barsSincePlan({ kind: "equity", bars }, NaN)).toHaveLength(0);
    expect(barsSincePlan({ kind: "equity", bars: [at("2026-11-27T17:30:00Z", 1, 0.5)] }, NaN)).toHaveLength(1);
  });

  it("reads crypto around the clock", () => {
    expect(barsSincePlan({ kind: "crypto", bars: [at("2026-10-28T03:00:00Z", 1, 0.5)] }, Date.parse("2026-10-28T02:00:00Z"))).toHaveLength(1);
    expect(barsSincePlan({ kind: "equity", bars: [at("2026-10-28T03:00:00Z", 1, 0.5)] }, Date.parse("2026-10-28T02:00:00Z"))).toHaveLength(0);
  });

  it("marks only the night's broken rows that are still standing, and writes nothing on a failed read", async () => {
    const updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
    const db = (rows: Record<string, unknown>[] | null) => ({
      from: () => {
        const filters: [string, unknown][] = [];
        let patch: Record<string, unknown> | null = null;
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (p: Record<string, unknown>) => ((patch = p), chain),
          eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
          in: (c: string, v: unknown) => (filters.push([c, v]), chain),
          is: (c: string, v: unknown) => (filters.push([c, v]), chain),
          not: () => chain,
          then: (resolve: (v: unknown) => void) => {
            if (patch) {
              updates.push({ patch, filters });
              return resolve({ error: null });
            }
            return resolve(rows ? { data: rows, error: null } : { data: null, error: { message: "down" } });
          },
        };
        return chain;
      },
    }) as unknown as SupabaseClient;
    const now = new Date("2026-10-28T14:30:00Z");
    await invalidateBrokenSweep(db(null), "2026-10-28", session, now);
    expect(updates).toHaveLength(0);
    await invalidateBrokenSweep(db([{ symbol: "BUY", direction: "bullish", stop_loss: 95, swept_at: swept }]), null, session, now);
    expect(updates).toHaveLength(0);
    await invalidateBrokenSweep(
      db([
        { symbol: "BUY", direction: "bullish", stop_loss: 95, swept_at: swept },
        { symbol: "HELD", direction: "bullish", stop_loss: 95, swept_at: swept },
      ]),
      "2026-10-28",
      session,
      now,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ invalidated_at: now.toISOString() });
    expect(updates[0].filters).toEqual([["basis_date", "2026-10-28"], ["symbol", ["BUY"]], ["invalidated_at", null]]);
  });
});
