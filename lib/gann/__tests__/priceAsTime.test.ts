import { describe, expect, it } from "vitest";
import { priceAsTimeDates, priceAsTimeHits, timePriceBalance } from "../priceAsTime";

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
