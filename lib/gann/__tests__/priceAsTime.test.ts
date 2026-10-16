import { describe, expect, it } from "vitest";
import {
  hexagonMonthsFromInception,
  marketDayElevenths,
  priceAsTimeDates,
  priceAsTimeHits,
  squareOf90Counts,
  timePriceBalance,
  twoPivotFraction,
} from "../priceAsTime";

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

describe("M-P9 / C-TIME-04 / C-TIME-22: a pivot's price read as time (Master Course Ch.4 PDF 145, 148-150)", () => {
  it("projects the 386 high as 386 calendar days, repeated, onto the printed dates", () => {
    // Ch.4 PDF 148-150: DJIA high 386 (Sept 3 1929) -> Sept 23 1930, Oct 14 1931,
    // Nov 4 1932, Nov 25 1933, Dec 16 1934, Jan 6 1936.
    const printed = ["1930-09-23", "1931-10-14", "1932-11-04", "1933-11-25", "1934-12-16", "1936-01-06"];
    const dates = priceAsTimeDates(386, "1929-09-03", "days", 6);
    expect(dates).toHaveLength(6);
    dates.forEach((d, i) => expect(daysApart(d, printed[i])).toBeLessThanOrEqual(1));
  });

  it("reads the low, the high and the range, in days, weeks and months", () => {
    // Price 60 on the 60th day (Ch.4 PDF 145): a low of 60 points, 60 days on.
    const low = { date: "2026-01-01", price: 60 };
    const high = { date: "2026-01-20", price: 90 };
    const hits = priceAsTimeHits(low, high, addDays("2026-01-01", 60), 1);
    expect(hits.some((h) => h.source === "low" && h.unit === "days" && h.multiple === 1)).toBe(true);
    // The range (30 points) counted from the later pivot: 30 days after the high.
    const r = priceAsTimeHits(low, high, addDays("2026-01-20", 30), 1);
    expect(r.some((h) => h.source === "range" && h.unit === "days")).toBe(true);
    // 90 weeks from the high.
    const w = priceAsTimeHits(low, high, addDays("2026-01-20", 90 * 7), 1);
    expect(w.some((h) => h.source === "high" && h.unit === "weeks" && h.multiple === 1)).toBe(true);
  });

  it("reads price in scaled points, not dollars", () => {
    // A $120 low at 2 dollars a point is 60 points.
    const hits = priceAsTimeHits({ date: "2026-01-01", price: 120 }, { date: "2026-01-02", price: 200 }, addDays("2026-01-01", 60), 2);
    expect(hits.some((h) => h.source === "low" && h.points === 60)).toBe(true);
  });

  it("is off the count between multiples", () => {
    const hits = priceAsTimeHits({ date: "2026-01-01", price: 60 }, { date: "2026-01-02", price: 61 }, addDays("2026-01-01", 75), 1);
    expect(hits.filter((h) => h.source === "low" && h.unit === "days")).toHaveLength(0);
  });
});

describe("Ch.18 TP-2: n points equal n weeks (Master Course PDF 440)", () => {
  it("balances a 52-point advance from the low against 52 weeks", () => {
    // TP-2: low 50, price 102, up 52 = one year in time.
    const b = timePriceBalance({ date: "2025-01-01", price: 50 }, { date: "2024-06-01", price: 60 }, addDays("2025-01-01", 364), 102, 1);
    expect(b.fromLow.points).toBe(52);
    expect(b.fromLow.balanced).toBe(true);
  });

  it("balances a 52-point decline from the high against 52 weeks", () => {
    // TP-2: high 182, now 130, down 52 = one year.
    const b = timePriceBalance({ date: "2024-06-01", price: 100 }, { date: "2025-01-01", price: 182 }, addDays("2025-01-01", 364), 130, 1);
    expect(b.fromHigh.balanced).toBe(true);
    expect(b.fromLow.balanced).toBe(false);
  });
});

describe("C-TIME-20: fractions of the year from the low meeting fractions from the high (Master Course Ch.18 TP-2 PDF 440)", () => {
  it("flags the date where 1/4 year from the low meets 1/3 year from the high", () => {
    // High first, low 30 days later: 91 days from the low = 121 days from the high.
    const high = { date: "2025-01-01", price: 100 };
    const low = { date: "2025-01-31", price: 60 };
    const r = twoPivotFraction(low, high, addDays("2025-01-31", 91), 75, 1);
    expect(r).toMatchObject({ fromLow: "1/4", fromHigh: "1/3" });
    expect(r!.priceAtHalfOrThreeQuarter).toBe(false);
  });

  it("is stronger with price at the half or three-quarter point of the range", () => {
    const high = { date: "2025-01-01", price: 100 };
    const low = { date: "2025-01-31", price: 60 };
    expect(twoPivotFraction(low, high, addDays("2025-01-31", 91), 80, 1)!.priceAtHalfOrThreeQuarter).toBe(true);
    expect(twoPivotFraction(low, high, addDays("2025-01-31", 91), 90, 1)!.priceAtHalfOrThreeQuarter).toBe(true);
  });

  it("meets 3/4 from the low with 2/3 from the high", () => {
    const low = { date: "2025-01-01", price: 60 };
    const high = { date: "2025-02-01", price: 100 };
    expect(twoPivotFraction(low, high, addDays("2025-01-01", 273), 75, 1)).toMatchObject({ fromLow: "3/4", fromHigh: "2/3" });
  });

  it("is null when only one side is on its fraction", () => {
    const high = { date: "2025-01-01", price: 100 };
    const low = { date: "2025-01-31", price: 60 };
    expect(twoPivotFraction(low, high, addDays("2025-01-31", 100), 75, 1)).toBeNull();
  });
});

describe("C-TIME-14: the square of 90 in months and weeks (Master Course Ch.4 PDF 125, 144; Ch.6 PDF 191-197)", () => {
  it("reads 90 months from the first trade as the full square", () => {
    // U.S. Steel, first trade Mar 28 1901; the square of 90 runs from Mar 1901.
    const hits = squareOf90Counts({ date: "1901-03-28", precision: "day" }, "inception", new Date("1908-09-28T12:00:00Z"));
    expect(hits).toEqual([expect.objectContaining({ unit: "months", step: 90, quarter: true, origin: "inception" })]);
  });

  it("reads the eighths (11 1/4 steps) and names the quarters", () => {
    const hits = squareOf90Counts({ date: "2025-01-01", precision: "day" }, "low", new Date(Date.parse("2025-01-01") + 45 * 7 * 86_400_000));
    expect(hits).toEqual([expect.objectContaining({ unit: "weeks", step: 45, quarter: true })]);
    const eighth = squareOf90Counts({ date: "2025-01-01", precision: "day" }, "low", new Date(Date.parse("2025-01-01") + Math.round(33.75 * 7) * 86_400_000));
    expect(eighth).toEqual([expect.objectContaining({ unit: "weeks", step: 33.75, quarter: false })]);
  });

  it("reads months only from a date known to the month, and nothing from a year", () => {
    const m = squareOf90Counts({ date: "2020-01-01", precision: "month" }, "inception", new Date("2023-10-15T12:00:00Z"));
    expect(m.every((h) => h.unit === "months")).toBe(true);
    expect(m.some((h) => h.step === 45)).toBe(true);
    expect(squareOf90Counts({ date: "2020-01-01", precision: "year" }, "inception", new Date("2023-10-15T12:00:00Z"))).toEqual([]);
  });
});

describe("C-TIME-07: market-day counts at multiples of 11 1/4 (Master Course Ch.16 PDF 428-430; Ch.4 PDF 123)", () => {
  const bars = (n: number, lowAt: number, highAt: number) =>
    Array.from({ length: n }, (_, i) => ({ t: addDays("2025-01-01", i), h: i === highAt ? 200 : 110, l: i === lowAt ? 50 : 100 }));

  it("counts market days (bars), not calendar days, from the extreme low", () => {
    // Auburn's 91 low came on the 67th market day from the top: 67 1/2 = 6 x 11 1/4.
    const hits = marketDayElevenths(bars(80, 12, 0));
    expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({ pivot: "low", marketDays: 67, multiple: 6 })]));
  });

  it("is off between multiples", () => {
    expect(marketDayElevenths(bars(52, 12, 0)).filter((h) => h.pivot === "low")).toEqual([]);
  });
});

describe("M-T18: months from the first trade on the hexagon's rings (Master Course Ch.15B PDF 422-423; Ch.6 PDF 197)", () => {
  it("puts U.S. Steel's 127th month from Mar 1901 on a ring completion", () => {
    // Ch.6 PDF 197: Oct 1911, the 128th month from Mar 1901, "out of the hexagon".
    const r = hexagonMonthsFromInception({ date: "1901-03-28", precision: "day" }, new Date("1911-10-28T12:00:00Z"));
    expect(r?.line).toMatchObject({ number: 127, kind: "completion" });
    expect(r?.named).toBe(127);
  });

  it("reads nothing between lines and nothing from a year-only date", () => {
    expect(hexagonMonthsFromInception({ date: "1901-03-28", precision: "day" }, new Date("1911-06-25T12:00:00Z"))).toBeNull();
    expect(hexagonMonthsFromInception({ date: "1901-01-01", precision: "year" }, new Date("1911-10-28T12:00:00Z"))).toBeNull();
  });
});
