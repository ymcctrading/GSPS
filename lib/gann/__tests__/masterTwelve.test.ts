import { describe, expect, it } from "vitest";
import {
  GREAT_CYCLE,
  HALVING_CHAIN,
  halvingChainTime,
  SQUARE_OF_9_TOTAL_CELLS,
  MASTER_NUMBERS,
  WHEAT_SQUARE_EXAMPLE,
  squareMonthsFromPriceRange,
  masterTwelveLevels,
} from "../masterTwelve";

describe("the Great Cycle halving chain", () => {
  it("starts at 20,736 (144^2)", () => {
    expect(GREAT_CYCLE).toBe(20736);
    expect(HALVING_CHAIN[0]).toBe(20736);
  });

  it("halves exactly at each step: 20736 -> 10368 -> 5184 -> 2592 -> 1296 -> 648 -> 324 -> 162 -> 81", () => {
    expect(HALVING_CHAIN).toEqual([20736, 10368, 5184, 2592, 1296, 648, 324, 162, 81]);
    for (let i = 1; i < HALVING_CHAIN.length; i++) {
      expect(HALVING_CHAIN[i]).toBe(HALVING_CHAIN[i - 1] / 2);
    }
  });

  it("terminates at 81, exactly 9^2 and exactly the base-9 grid's own 9x9 cell count", () => {
    const last = HALVING_CHAIN[HALVING_CHAIN.length - 1];
    expect(last).toBe(81);
    expect(last).toBe(9 * 9);
    expect(last).toBe(SQUARE_OF_9_TOTAL_CELLS);
  });
});

describe("Master Numbers", () => {
  it("are exactly 3, 5, 7, 9, 12, each with stated reasoning", () => {
    expect(MASTER_NUMBERS.map((m) => m.n)).toEqual([3, 5, 7, 9, 12]);
    expect(MASTER_NUMBERS.every((m) => m.reasoning.length > 0)).toBe(true);
  });
});

describe("the wheat Square-of-144 worked example", () => {
  it("reproduces 281 exactly: the May option's high minus low, in cents, read as months", () => {
    const { mayOptionLowCents, mayOptionHighCents } = WHEAT_SQUARE_EXAMPLE;
    expect(squareMonthsFromPriceRange(mayOptionLowCents, mayOptionHighCents)).toBe(281);
  });

  it("carries the source's own stated window of 281 to 288 months", () => {
    expect(WHEAT_SQUARE_EXAMPLE.changeWindowMonths).toEqual([281, 288]);
    expect(WHEAT_SQUARE_EXAMPLE.allTimeLowCents).toBe(28);
    expect(WHEAT_SQUARE_EXAMPLE.allTimeLowDate).toBe("1852-03");
  });
});

describe("masterTwelveLevels", () => {
  it("returns no levels for a non-positive anchor or current price", () => {
    expect(masterTwelveLevels(0, 100)).toEqual([]);
    expect(masterTwelveLevels(100, 0)).toEqual([]);
  });

  it("produces 12-fold angular levels sorted by proximity to current price", () => {
    const levels = masterTwelveLevels(100, 105, 2);
    expect(levels.length).toBeGreaterThan(0);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].distancePct).toBeGreaterThanOrEqual(levels[i - 1].distancePct);
    }
    const degrees = new Set(levels.map((l) => l.degree));
    for (const d of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
      expect(degrees.has(d)).toBe(true);
    }
  });
});

describe("C-TIME-17: the halving chain as calendar days from a pivot (Master Course Ch.13 PDF 375, 379)", () => {
  const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

  it("is on the chain 324 days after the low and projects the next term", () => {
    const r = halvingChainTime({ date: "2025-01-01", price: 10 }, { date: "2024-06-01", price: 20 }, addDays("2025-01-01", 324));
    expect(r.hits).toEqual([expect.objectContaining({ pivot: "low", days: 324 })]);
    const next = r.next.find((n) => n.pivot === "low")!;
    expect(next.days).toBe(648);
    expect(next.date).toBe(addDays("2025-01-01", 648));
  });

  it("reads the full cycle as 56 years 9 months and about 23 days of 365-day years", () => {
    // Ch.13 PDF 379: "56 years, 9 months and 23 days".
    const years = Math.floor(GREAT_CYCLE / 365);
    const rest = GREAT_CYCLE - years * 365;
    expect(years).toBe(56);
    expect(Math.floor(rest / (365 / 12))).toBe(9);
  });

  it("is off the chain between terms", () => {
    const r = halvingChainTime({ date: "2025-01-01", price: 10 }, { date: "2024-06-01", price: 20 }, addDays("2025-01-01", 200));
    expect(r.hits).toHaveLength(0);
  });
});
