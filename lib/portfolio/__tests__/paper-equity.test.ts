import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maxDrawdownPct, paperDrawdownPct, paperEquity, recordPaperEquityMarks } from "@/lib/portfolio/paper-equity";

describe("paperEquity", () => {
  it("adds longs at their mark and takes shorts off, since a short's sale was credited to cash", () => {
    // $100k start; bought 100 @ 50 (cash 95k), shorted 100 @ 40 (cash 99k).
    expect(paperEquity(99_000, [{ side: "long", qty: 100, price: 55 }, { side: "short", qty: 100, price: 38 }])).toBe(
      99_000 + 5_500 - 3_800,
    );
  });

  it("is the cash alone with nothing open", () => {
    expect(paperEquity(100_000, [])).toBe(100_000);
  });
});

describe("maxDrawdownPct", () => {
  it("reads each day's low against the peak before it", () => {
    const marks = [
      { high: 105_000, low: 100_000 },
      { high: 110_000, low: 104_000 },
      { high: 100_000, low: 99_000 },
    ];
    expect(maxDrawdownPct(marks, 100_000)).toBeCloseTo(10, 6);
  });

  it("does not invent a drawdown inside one day whose high came after its low", () => {
    expect(maxDrawdownPct([{ high: 120_000, low: 100_000 }], 100_000)).toBe(0);
  });
});

describe("recordPaperEquityMarks", () => {
  it("sends the marks to the database's fold in one call", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: (fn: string, args: unknown) => (calls.push({ fn, args }), Promise.resolve({ data: 1, error: null })),
    } as unknown as SupabaseClient;

    const result = await recordPaperEquityMarks(
      client,
      new Map([["p1", { equity: 98_000, cash: 90_000, openPositions: 2 }]]),
      new Date("2026-10-21T18:00:00Z"),
    );

    expect(result).toEqual({ recorded: 1, error: null });
    expect(calls).toEqual([
      {
        fn: "record_paper_equity_marks",
        args: {
          p_marks: [
            expect.objectContaining({ profile_id: "p1", session_date: "2026-10-21", equity: 98_000, cash: 90_000, open_positions: 2 }),
          ],
        },
      },
    ]);
  });
});

describe("paperDrawdownPct", () => {
  function client(inWindow: { session_date: string; high_equity: number; low_equity: number }[], before: { equity: number } | null, beforeError: unknown = null) {
    let call = 0;
    const chain = () => {
      const self: Record<string, unknown> = {};
      for (const k of ["select", "eq", "gte", "lt", "order", "limit"]) self[k] = () => self;
      const n = call++;
      self.then = (resolve: (v: unknown) => void) =>
        resolve(n === 0 ? { data: inWindow, error: null } : { data: before, error: beforeError });
      self.maybeSingle = () => Promise.resolve({ data: before, error: beforeError });
      return self;
    };
    return { from: () => chain() } as unknown as SupabaseClient;
  }

  it("starts from the window's own first low when the record holds nothing earlier, not the starting balance", async () => {
    // An account at $90k from losses before the window, flat since: no drawdown inside the window.
    const dd = await paperDrawdownPct(client([{ session_date: "2026-10-21", high_equity: 90_200, low_equity: 90_000 }], null), "p1", new Date("2026-10-01T16:00:00Z"));
    expect(dd).toBe(0);
  });

  it("reads from the last mark before the window when there is one", async () => {
    const dd = await paperDrawdownPct(client([{ session_date: "2026-10-21", high_equity: 95_000, low_equity: 90_000 }], { equity: 100_000 }), "p1", new Date("2026-10-01T16:00:00Z"));
    expect(dd).toBeCloseTo(10, 6);
  });

  it("is unread when the earlier record can't be read", async () => {
    const dd = await paperDrawdownPct(client([{ session_date: "2026-10-21", high_equity: 95_000, low_equity: 90_000 }], null, { message: "down" }), "p1", new Date("2026-10-01T16:00:00Z"));
    expect(dd).toBeNull();
  });
});
