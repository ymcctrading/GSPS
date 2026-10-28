import { describe, expect, it } from "vitest";
import { rankSessionSetups, type ListRow, type SweepRow } from "@/lib/scanner/sessionSetups";

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
});
