import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { capitalSize, LARGE_CAPITAL_MIN_SHARES, PYRAMID_STEP_POINTS, readPyramidAdd, wholeLineStop } from "@/lib/gann/pyramid";
import { gannPoint } from "@/lib/gann/pointScale";
import { readHoldTime } from "@/lib/gann/exitRules";

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}

// A rise with a pullback after the first lot (day 3), leaving a swing top near 110.5.
const closes = [100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 111];
const daily = days(closes);

describe("readPyramidAdd", () => {
  // Filled at 101.8 on day 3, so the first close (102) and the third (106) are
  // in profit: the time-to-hold rule (A-TIME-12) lets the trade be added to.
  // The risk unit is 3.5, as it was when the lot sat at 102 over a 98 stop.
  const base = {
    side: "long" as const,
    lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }],
    stop: 98.3,
    initialStop: 98.3,
    daily,
  };

  it("adds half the last lot at the crossed swing top and lifts the stop to break-even", () => {
    const r = readPyramidAdd({ ...base, price: 111 });
    expect(r.add).not.toBeNull();
    expect(r.add!.qty).toBe(50);
    expect(r.add!.trigger).toBeGreaterThan(110.5);
    expect(r.add!.newStop).toBeGreaterThan(102);
  });

  it("never adds to a position that hasn't gained a step", () => {
    expect(readPyramidAdd({ ...base, price: 105 }).add).toBeNull();
  });

  // Never average a loss (W006 pp.15-16, 47): no add below the last lot.
  it("never adds to a losing position", () => {
    for (const price of [100, 99]) {
      const r = readPyramidAdd({ ...base, price });
      expect(r.add).toBeNull();
      // Refused by the profit guard itself, not by a later check.
      expect(r.reason).toMatch(/hasn.t yet gained/);
    }
  });

  // Q9 (owner: W022 and the Master Course): the largest lot first, each add
  // half the last, with no fixed count; the pyramid ends when the next lot
  // would be under one share.
  it("keeps adding smaller lots past the fourth", () => {
    const lots = Array.from({ length: 4 }, (_, i) => ({ qty: 100 >> i, price: 101.8, date: "2026-06-03" }));
    expect(readPyramidAdd({ ...base, lots, price: 111 }).add?.qty).toBe(6);
  });

  it("stops adding once the next lot would be under one share", () => {
    const lots = Array.from({ length: 7 }, (_, i) => ({ qty: 100 >> i, price: 101.8, date: "2026-06-03" }));
    const r = readPyramidAdd({ ...base, lots, price: 111 });
    expect(r.add).toBeNull();
    expect(r.reason).toMatch(/less than one share/);
  });
});

describe("time to hold (A-TIME-12, W006 p.23)", () => {
  it("warns when the first close is against the trade, long and short", () => {
    expect(readHoldTime("long", 102.5, "2026-06-03", daily)).toEqual({ firstCloseAgainst: true, withTrendAfter3: false });
    expect(readHoldTime("short", 101.5, "2026-06-03", daily)?.firstCloseAgainst).toBe(true);
    expect(readHoldTime("long", 101.8, "2026-06-03", daily)?.firstCloseAgainst).toBe(false);
    // A first close exactly at the entry is not against the trade (nor yet in profit).
    expect(readHoldTime("long", 102, "2026-06-03", daily)).toEqual({ firstCloseAgainst: false, withTrendAfter3: false });
    expect(readHoldTime("short", 102, "2026-06-03", daily)?.firstCloseAgainst).toBe(false);
  });

  it("reads a profit at the first close that is still there on the third as with the trend", () => {
    expect(readHoldTime("long", 101.8, "2026-06-03", daily)?.withTrendAfter3).toBe(true);
    // In profit at the first close, under the entry again by the third (closes 108, 110, 109... from day 6).
    expect(readHoldTime("long", 108.5, "2026-06-07", daily)).toEqual({ firstCloseAgainst: false, withTrendAfter3: false });
    // Only two sessions closed: not yet known.
    expect(readHoldTime("long", 101.8, "2026-06-03", daily.slice(0, 4))?.withTrendAfter3).toBeNull();
    // Exactly three sessions closed: known (item 7e review L1).
    expect(readHoldTime("long", 101.8, "2026-06-03", daily.slice(0, 5))?.withTrendAfter3).toBe(true);
    expect(readHoldTime("short", 112, "2026-06-07", daily)?.withTrendAfter3).toBe(true);
  });

  it("refuses a pyramid add until the trade has shown it is with the trend, and passes the warning on", () => {
    const base = { side: "long" as const, lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }], stop: 98.3, initialStop: 98.3, daily };
    const early = readPyramidAdd({ ...base, daily: daily.slice(0, 4), price: 111 });
    expect(early.add).toBeNull();
    expect(early.reason).toMatch(/Three days haven't closed/);
    // Filled at 102.2: the first close (102) is against it, so no add even at 111.
    const against = readPyramidAdd({ ...base, lots: [{ qty: 100, price: 102.2, date: "2026-06-03" }], stop: 98.7, initialStop: 98.7, price: 111 });
    expect(against.add).toBeNull();
    expect(against.reason).toMatch(/did not show a profit at its first close/);
    expect(against.holdWarning).toMatch(/first day closed against the trade/);
  });
});

// Rule 21 of the twenty-four (Wall Street Stock Selector, 1930, Ch. II):
// pyramid longs in stocks with small capital, shorts in stocks with large.
describe("pyramid side by capital stock (never-failing rule 21)", () => {
  const base = {
    side: "long" as const,
    lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }],
    stop: 98.3,
    initialStop: 98.3,
    daily,
    price: 111,
  };

  it("adds to a long in a stock with a small capital stock", () => {
    expect(readPyramidAdd({ ...base, capitalStock: 200_000_000 }).add?.qty).toBe(50);
  });

  it("does not add to a long in a stock with a large capital stock", () => {
    const r = readPyramidAdd({ ...base, capitalStock: 5_000_000_000 });
    expect(r.add).toBeNull();
    expect(r.reason).toMatch(/small capital stock/);
  });

  it("does not add to a short in a stock with a small capital stock", () => {
    const r = readPyramidAdd({ ...base, side: "short", stop: 105, initialStop: 105, price: 95, capitalStock: 200_000_000 });
    expect(r.add).toBeNull();
    expect(r.reason).toMatch(/large capital stock/);
  });

  it("lets a short in a stock with a large capital stock through to the other rules", () => {
    const r = readPyramidAdd({ ...base, side: "short", stop: 105, initialStop: 105, price: 95, capitalStock: 5_000_000_000 });
    expect(r.reason ?? "").not.toMatch(/capital stock/);
  });

  it("holds the add when a stock's share count is unknown", () => {
    const r = readPyramidAdd({ ...base, capitalStock: null });
    expect(r.add).toBeNull();
    expect(r.reason).toMatch(/share count/);
  });

  it("reads small and large on the labelled cutoff", () => {
    expect(capitalSize(LARGE_CAPITAL_MIN_SHARES - 1)).toBe("small");
    expect(capitalSize(LARGE_CAPITAL_MIN_SHARES)).toBe("large");
    expect(capitalSize(null)).toBeNull();
    expect(capitalSize(0)).toBeNull();
  });
});

describe("fixed steps and the whole-line stop (A-PYRAMID-01, A-PYRAMID-06, A-STOP-06)", () => {
  const base = {
    side: "long" as const,
    lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }],
    // A wide stop: one risk unit (21.8) is far beyond the 5-point step.
    stop: 80,
    initialStop: 80,
    daily,
  };
  const step = PYRAMID_STEP_POINTS * gannPoint(101.8);

  it("adds every 5 points of profit, however wide the first stop", () => {
    expect(PYRAMID_STEP_POINTS).toBe(5);
    expect(readPyramidAdd({ ...base, price: 111 }).add).not.toBeNull();
    expect(readPyramidAdd({ ...base, price: 101.8 + step - 0.05 }).add).toBeNull();
  });

  it("raises the whole line's stop to 5 points under the add when that is above break-even", () => {
    expect(wholeLineStop("long", 100, 130, 90)).toBeCloseTo(130 - 5 * gannPoint(130), 8);
    expect(wholeLineStop("long", 128, 130, 90)).toBe(128);
    expect(wholeLineStop("short", 100, 70, 110)).toBeCloseTo(70 + 5 * gannPoint(70), 8);
    // Never loosens a stop that is already tighter.
    expect(wholeLineStop("long", 100, 130, 129)).toBe(129);
  });
});

// A-PYRAMID-08 (W001 p.7, the 1954 soybean record): sold more on each further
// decline. The short mirror of the add above; the re-short on the rally is the
// re-entry after a stop (lib/gann/rebuy.ts).
describe("adding to a short on the decline (A-PYRAMID-08)", () => {
  const fall = days(closes.map((c) => 200 - c));
  it("adds half the last lot at the crossed swing bottom and lowers the stop to break-even", () => {
    const r = readPyramidAdd({
      side: "short",
      lots: [{ qty: 100, price: 98.2, date: "2026-06-03" }],
      stop: 101.7,
      initialStop: 101.7,
      daily: fall,
      price: 89,
    });
    expect(r.add).not.toBeNull();
    expect(r.add!.qty).toBe(50);
    expect(r.add!.trigger).toBeLessThan(98.2);
    expect(r.add!.newStop).toBeLessThanOrEqual(101.7);
  });
});
