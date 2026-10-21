import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maxDrawdownPct, paperEquity, recordPaperEquityMarks } from "@/lib/portfolio/paper-equity";

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
  it("folds a new mark into the day's high and low", async () => {
    const upserts: unknown[] = [];
    const client = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ profile_id: "p1", session_date: "2026-10-21", equity: 101_000, high_equity: 102_000, low_equity: 99_000 }],
                  error: null,
                }),
            }),
          }),
          upsert: (rows: unknown) => (upserts.push(rows), Promise.resolve({ error: null })),
        };
      },
    } as unknown as SupabaseClient;

    const result = await recordPaperEquityMarks(
      client,
      new Map([["p1", { equity: 98_000, cash: 90_000, openPositions: 2 }]]),
      new Date("2026-10-21T18:00:00Z"),
    );

    expect(result).toEqual({ recorded: 1, error: null });
    expect(upserts[0]).toEqual([
      expect.objectContaining({ profile_id: "p1", session_date: "2026-10-21", equity: 98_000, high_equity: 102_000, low_equity: 98_000 }),
    ]);
  });
});
