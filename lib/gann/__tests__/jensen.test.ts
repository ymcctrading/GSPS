import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  jensenAspectCalendar,
  jensenAspectOf,
  jensenLevels,
  jensenPriceHit,
  jensenProjection,
  jensenTimeCounts,
  jensenWindows,
  readJensenAspects,
} from "../jensen";

const DAY = 86_400_000;
const bar = (t: number, c: number, l = c - 0.5, h = c + 0.5): Bar => ({ t: new Date(t).toISOString(), o: c, h, l, c, v: 1000 });

describe("Jensen's slow-planet aspects (checked against his own dated positions, B16 §6)", () => {
  it("reads Jupiter square Saturn on May 5, 1946 as a square-family aspect", () => {
    const r = readJensenAspects(new Date("1946-05-05T12:00:00Z"));
    const js = r.hits.find((h) => h.pair[0] === "Jupiter" && h.pair[1] === "Saturn");
    expect(js?.aspect).toMatchObject({ angle: 90, family: "square" });
    expect(js!.offBy).toBeLessThan(0.5);
  });

  it("dates the exact Jupiter–Uranus trine of July 1932", () => {
    const events = jensenAspectCalendar(new Date("1932-07-01T12:00:00Z"), new Date("1932-07-20T12:00:00Z"));
    const trine = events.filter((e) => e.kind === "exact" && e.pair[0] === "Jupiter" && e.pair[1] === "Uranus" && e.aspect.angle === 120);
    expect(trine.map((e) => e.date)).toEqual(expect.arrayContaining([expect.stringMatching(/^1932-07-(09|10)$/)]));
    expect(trine[0].expect).toBe("advance");
  });

  it("uses his orbs and reads the nearer aspect where two overlap", () => {
    expect(jensenAspectOf(146)).toMatchObject({ angle: 144, family: "quintile" });
    expect(jensenAspectOf(149)).toMatchObject({ angle: 150, family: "trine" });
    expect(jensenAspectOf(100)).toBeNull();
    expect(jensenAspectOf(172)).toMatchObject({ angle: 180, family: "square" });
  });
});

describe("Jensen's square of 90", () => {
  const start = Date.parse("2026-01-01T12:00:00Z");
  // Low of 40 on day 10, high of 100 on day 40, price 98 at the end.
  const series: Bar[] = [];
  for (let i = 0; i < 60; i++) {
    const c = i === 10 ? 40.5 : i === 40 ? 99.5 : i === 59 ? 98 : 70;
    series.push(bar(start + i * DAY, c, i === 10 ? 40 : c - 0.5, i === 40 ? 100 : c + 0.5));
  }

  it("counts down from the high as well as up from the low", () => {
    const levels = jensenLevels(series, 98, 1);
    // From the high: 100 − 5⅝ = 94.375 below; from the low: 40 + 67½ = 107.5
    // above (40 + 60 = 100 is a trine point, so not a level).
    expect(levels.map((l) => l.price)).toEqual([94.375, 107.5]);
    expect(levels[0].label).toContain("below the high");
  });

  it("lays the square at the long record's major low and high when one is given", () => {
    // A monthly record whose low (20) and high (110) lie outside the daily year.
    const record: Bar[] = [bar(start - 400 * DAY, 30, 20, 40), bar(start - 300 * DAY, 100, 90, 110), ...series];
    const levels = jensenLevels(series, 98, 1, record);
    // 67½ points up from the record low of 20 below price, 11¼ down from the
    // record high of 110 above it; the daily year alone gave 94.375 and 107.5.
    expect(levels.map((l) => l.price)).toEqual([87.5, 98.75]);
    expect(jensenLevels(series, 98, 1, [])).toEqual(jensenLevels(series, 98, 1));
    expect(jensenPriceHit(series, 87.5, 1, record)).toMatchObject({ level: 87.5 });
  });

  // C-LEVELS-21: the square points mark resistance, the trine points
  // consolidation, and 90 and 45 are doubly strong.
  it("classes 15, 30, 60 and 75 points from the low as trine points, and 22½, 45, 67½ and 90 as squares", () => {
    for (const p of [15, 30, 60, 75]) expect(jensenPriceHit(series, 40 + p, 1), String(p)).toMatchObject({ points: p, square: false, strong: false });
    for (const p of [22.5, 45, 67.5, 90]) expect(jensenPriceHit(series, 40 + p, 1), String(p)).toMatchObject({ points: p, square: true });
    expect(jensenPriceHit(series, 85, 1)!.strong).toBe(true);
    expect(jensenPriceHit(series, 130, 1)!.strong).toBe(true);
    expect(jensenPriceHit(series, 62.5, 1)!.strong).toBe(false);
  });

  it("puts only square points in the levels, never a trine point", () => {
    for (let price = 41; price < 200; price += 0.75) {
      for (const l of jensenLevels(series, price, 1)) expect(l.label, `${price}: ${l.label}`).toContain("(square point");
    }
  });

  it("repeats the square past 90 points", () => {
    expect(jensenPriceHit(series, 175, 1)).toMatchObject({ points: 135, from: "low", square: true });
  });

  it("dates the time counts from the low and the high", () => {
    const counts = jensenTimeCounts(series, new Date(start + 50 * DAY), new Date(start + 60 * DAY));
    expect(counts).toEqual(expect.arrayContaining([expect.objectContaining({ from: "low", unit: "days", points: 45 })]));
    expect(counts).toEqual(expect.arrayContaining([expect.objectContaining({ from: "high", unit: "days", points: 15 })]));
  });
});

describe("Jensen's projection", () => {
  it("crosses the 60° line from the lowest close with the 45° line from the previous swing close", () => {
    const start = Date.parse("2026-01-01T12:00:00Z");
    const closes = [80, 78, 76, 74, 72, 70, 72, 74, 76, 78, 80, 82, 80, 78, 76, 74, 72, 70, 68, 66, 64, 66, 68, 70, 72];
    const series = closes.map((c, i) => bar(start + i * DAY, c));
    const p = jensenProjection(series, 1)!;
    expect(p.direction).toBe("up");
    expect(p.fromDate).toBe("2026-01-21");
    expect(p.previousDate).toBe("2026-01-06");
    const t = (Date.parse(`${p.date}T00:00:00Z`) - Date.parse("2026-01-21T00:00:00Z")) / DAY;
    // At the crossing the 60° line from 64 reaches the projected price, to within a day's rounding.
    expect(Math.abs(64 + Math.tan(Math.PI / 3) * t - p.price)).toBeLessThan(2);
    expect(p.price).toBeGreaterThan(64);
  });
});

describe("jensenWindows", () => {
  it("gathers counts and aspect dates in date order", () => {
    const start = Date.parse("2026-01-01T12:00:00Z");
    const series = Array.from({ length: 60 }, (_, i) => bar(start + i * DAY, i === 10 ? 40 : 60));
    const w = jensenWindows(series, 1, new Date(start + 60 * DAY), new Date(start + 400 * DAY));
    expect(w.some((x) => x.source === "count")).toBe(true);
    expect(w.some((x) => x.source === "aspect")).toBe(true);
    expect([...w].sort((a, b) => a.date.localeCompare(b.date))).toEqual(w);
  });
});
