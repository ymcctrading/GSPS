import { describe, expect, it } from "vitest";
import { countedName, isNameNumber, nameNumberLevels, nameSquare } from "@/lib/gann/nameNumerology";
import { greatCycleEndMonth, greatCycleHits, GREAT_CYCLES } from "@/lib/gann/timeCycles";
import { inceptionWindows, readWindowTurn } from "@/lib/gann/timeWindow";
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

// A-OTHER-08, Master Course Ch. 15A (PDF 401-402): "United States Steel"
// has 17 letters, a Square of 289; its multiples strike the name's vibrations.
describe("name chart", () => {
  it("counts the name as the course does, legal-form words and state tags dropped", () => {
    expect(countedName("United States Steel Corp /DE/")).toBe("UNITED STATES STEEL");
    expect(nameSquare("United States Steel Corporation")).toEqual({ counted: "UNITED STATES STEEL", letters: 17, square: 289 });
    expect(nameSquare("America")?.square).toBe(49);
    expect(nameSquare("United States of America")).toMatchObject({ letters: 21, square: 441 });
  });

  it("keeps a name made only of legal-form words, and refuses one under 3 letters", () => {
    expect(countedName("Company Inc")).toBe("COMPANY INC");
    expect(nameSquare("GE")).toBeNull();
    expect(nameSquare(null)).toBeNull();
  });

  it("reads the multiples of the letter count and the half of each square", () => {
    const steel = nameSquare("United States Steel")!;
    for (const n of [17, 34, 51, 272, 289, 306]) expect(isNameNumber(steel, n)).toBe(true);
    expect(isNameNumber(steel, 144.5)).toBe(true);
    expect(isNameNumber(steel, 433.5)).toBe(true);
    for (const n of [0, -17, 18, 144, 145, 16.5]) expect(isNameNumber(steel, n)).toBe(false);
    // 220½ for the Square of 21, as Gann gives it.
    expect(isNameNumber(nameSquare("United States of America")!, 220.5)).toBe(true);
  });

  it("gives the nearest key number below and above price, in points", () => {
    const steel = nameSquare("United States Steel")!;
    expect(nameNumberLevels(steel, 140, 1).map((l) => l.price)).toEqual([136, 144.5]);
    expect(nameNumberLevels(steel, 140, 1)[1].label).toBe("144.5 on the name's 17-letter square");
    // Two dollars a point: the same numbers, doubled.
    expect(nameNumberLevels(steel, 280, 2).map((l) => l.price)).toEqual([272, 289]);
    expect(nameNumberLevels(steel, 10, 1).map((l) => l.price)).toEqual([17]);
    expect(nameNumberLevels(null, 140, 1)).toEqual([]);
    expect(nameNumberLevels(steel, 0, 1)).toEqual([]);
  });
});

// A-TIME-24: the end of a great time cycle, per lesson.
describe("great cycles", () => {
  const byLabel = (l: string) => GREAT_CYCLES.find((c) => c.label === l)!;

  it("ends each cycle where its lesson puts it", () => {
    expect(greatCycleEndMonth("1901-02", byLabel("20-year"))).toBe("1921-02");
    expect(greatCycleEndMonth("1901-02", byLabel("90-year"))).toBe("1991-02");
    // 20,736 days is 56 years 9 months 23 days.
    expect(greatCycleEndMonth("1901-02-25", byLabel("20,736-day"))).toBe("1957-12");
    expect(greatCycleEndMonth("not a date", byLabel("60-year"))).toBeNull();
  });

  it("counts from the monthly chart only the cycles the yearly list lacks", () => {
    // A zigzag of monthly swings; anchor on a major low the pivot reader finds.
    const bars: Bar[] = [];
    for (let i = 0; i < 120; i++) {
      const t = new Date(Date.UTC(1945, i, 1)).toISOString();
      const c = 50 + 10 * Math.sin(i / 4) + i * 0.05;
      bars.push({ t, o: c, h: c + 1, l: c - 1, c, v: 1 });
    }
    const anchor = majorPivots(findPivots(bars, 3)).find((p) => p.kind === "low")!;
    const lowMonth = anchor.bar.t.slice(0, 7);
    const end = greatCycleEndMonth(lowMonth, byLabel("20,736-day"))!;
    const hits = greatCycleHits(bars, new Date(`${end}-15T12:00:00Z`));
    expect(hits.some((h) => h.kind === "low" && h.pivotMonth === lowMonth && h.cycle.label === "20,736-day")).toBe(true);
    // 20 and 60 years are already yearly counts, so they are never repeated here.
    const twenty = greatCycleEndMonth(lowMonth, byLabel("20-year"))!;
    expect(greatCycleHits(bars, new Date(`${twenty}-15T12:00:00Z`)).some((h) => h.cycle.label === "20-year")).toBe(false);
    expect(greatCycleHits(bars.slice(0, 12), new Date())).toEqual([]);
  });
});

describe("inception windows", () => {
  const steel = { inception: { date: "1901-02-25", precision: "day" as const }, name: "United States Steel Corp" };

  it("opens in the month a great cycle from inception ends", () => {
    expect(inceptionWindows(steel, new Date("1991-02-10T12:00:00Z"))).toContain(
      "the end of a 90-year great cycle from the company's 1901-02 inception",
    );
    expect(inceptionWindows(steel, new Date("1957-12-10T12:00:00Z"))).toContain(
      "the end of a 20,736-day great cycle from the company's 1901-02 inception",
    );
  });

  it("opens in the month the company's age is one of its name's numbers", () => {
    // 1901-02 + 51 years = 1952-02; 51 is 3 × 17.
    expect(inceptionWindows(steel, new Date("1952-02-10T12:00:00Z"))).toEqual([
      "51 years from the company's 1901-02 inception, a number of its 17-letter name",
    ]);
    expect(inceptionWindows(steel, new Date("1952-03-10T12:00:00Z"))).toEqual([]);
    // 144½ years: the half of the Square of 289, counted to the month.
    expect(inceptionWindows(steel, new Date("2045-08-10T12:00:00Z"))).toContain(
      "144.5 years from the company's 1901-02 inception, a number of its 17-letter name",
    );
  });

  it("opens none for an inception known only to the year, or none at all", () => {
    expect(inceptionWindows({ ...steel, inception: { date: "1901-01-01", precision: "year" } }, new Date("1952-01-10T12:00:00Z"))).toEqual([]);
    expect(inceptionWindows({ inception: null, name: "United States Steel" }, new Date("1952-02-10T12:00:00Z"))).toEqual([]);
    expect(inceptionWindows(null, new Date())).toEqual([]);
  });

  it("is handed to the window reader by readWindowTurn", () => {
    const closes = [110, 108, 106, 104, 102, 100, 98, 100, 102, 104, 106, 108, 110, 112];
    const t0 = Date.parse("1952-02-01T00:00:00Z");
    const daily: Bar[] = closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
    let seen: unknown = undefined;
    readWindowTurn(daily, "bullish", null, (_b, _d, _k, _m, anchors) => {
      seen = anchors;
      return [];
    }, steel);
    expect(seen).toBe(steel);
    const turn = readWindowTurn(daily, "bullish", null, undefined, steel);
    expect(turn?.windows).toContain("51 years from the company's 1901-02 inception, a number of its 17-letter name");
  });
});
