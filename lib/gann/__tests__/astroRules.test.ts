import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { activeAngleLevels, jensenLevels, readAstroRules } from "../astroRules";
import { gannMasterLevels } from "../masterLevels";
import { planetLongitudes } from "../planetaryAverages";

const DAY = 86_400_000;
/** 60 daily bars ending on `end`, the low (`low`) 40 days before, closing at `close`. */
function bars(end: string, low: number, close: number): Bar[] {
  const endT = Date.parse(`${end}T12:00:00Z`);
  const out: Bar[] = [];
  for (let i = 59; i >= 0; i--) {
    const t = new Date(endT - i * DAY).toISOString();
    const c = i === 40 ? low + 1 : i === 0 ? close : low + 5 + (i % 3);
    out.push({ t, o: c, h: c + 0.5, l: i === 40 ? low : c - 0.5, c, v: 1000 });
  }
  return out;
}

describe("readAstroRules", () => {
  it("reads the natural angle on the egg example: 1500 = 60°, the low 7 days after the Sun stood there", () => {
    const r = readAstroRules(bars("1932-05-28", 1490, 1500), new Date("1932-05-28T12:00:00Z"), 1)!;
    expect(r.naturalAngle.priceDegree).toBeCloseTo(60, 5);
    expect(r.naturalAngle.days).toBeGreaterThanOrEqual(-8);
    expect(r.naturalAngle.days).toBeLessThanOrEqual(-6);
    expect(r.naturalAngle.near).toBe(true);
  });

  it("finds the Sun at 0° on the March equinox, and a New Moon on its date", () => {
    expect(readAstroRules(bars("2025-03-20", 40, 50), new Date("2025-03-20T12:00:00Z"), 1)!.solarPoint).toMatchObject({ degree: 0, kind: "ingress" });
    expect(readAstroRules(bars("2024-01-11", 40, 50), new Date("2024-01-11T12:00:00Z"), 1)!.newMoon).not.toBeNull();
    expect(readAstroRules(bars("2024-01-18", 40, 50), new Date("2024-01-18T12:00:00Z"), 1)!.newMoon).toBeNull();
  });

  it("puts price on an active angle when it sits on heliocentric Jupiter's longitude", () => {
    const date = new Date("2026-06-01T12:00:00Z");
    const jup = planetLongitudes(date).helio.Jupiter;
    const r = readAstroRules(bars("2026-06-01", jup + 300, jup + 360), date, 1)!;
    expect(r.activeAngles.some((a) => a.body === "Jupiter" && a.frame === "helio" && a.aspect === 0)).toBe(true);
  });

  it("flags Mars opposite its place at the low on the date it projects", () => {
    const r = readAstroRules(bars("2026-06-01", 40, 50), new Date("2026-06-01T12:00:00Z"), 1)!;
    const next = r.marsHalfReturn!.next!;
    expect(next > "2026-06-01").toBe(true);
    // Re-read on that date, with a series that keeps the same low.
    const lowDate = r.marsHalfReturn!.lowDate;
    const daysToLow = Math.round((Date.parse(next) - Date.parse(lowDate)) / DAY);
    const series: Bar[] = [];
    for (let i = daysToLow + 5; i >= 0; i--) {
      const t = new Date(Date.parse(`${next}T12:00:00Z`) - i * DAY).toISOString();
      const isLow = t.slice(0, 10) === lowDate;
      series.push({ t, o: 50, h: 50.5, l: isLow ? 40 : 49.5, c: 50, v: 1000 });
    }
    const again = readAstroRules(series, new Date(`${next}T12:00:00Z`), 1)!;
    expect(again.marsHalfReturn?.lowDate).toBe(lowDate);
    expect(again.marsHalfReturn?.today).toBe(true);
  });

  it("reads Jensen's square of 90: 45 points above the low is a square point", () => {
    const r = readAstroRules(bars("2026-06-01", 40, 85), new Date("2026-06-01T12:00:00Z"), 1)!;
    expect(r.jensen.price).toMatchObject({ points: 45, square: true });
  });

  it("reads Jensen's time count from the low: 45 days on is a count", () => {
    // The low sits 40 days back in `bars`; read 5 days later.
    const r = readAstroRules(bars("2026-06-01", 40, 50), new Date("2026-06-06T12:00:00Z"), 1)!;
    expect(r.jensen.time).toMatchObject({ from: "low", unit: "days", points: 45 });
  });
});

describe("activeAngleLevels (active angles act as price resistance)", () => {
  const date = new Date("2026-06-01T12:00:00Z");

  it("gives each body its nearest active angle above and below price, one point to a degree", () => {
    const levels = activeAngleLevels(date, 500, 1);
    expect(levels).toHaveLength(6);
    for (const body of ["Jupiter", "Saturn", "Uranus"]) {
      const mine = levels.filter((l) => l.label.endsWith(body)).map((l) => l.price);
      expect(mine).toHaveLength(2);
      expect(Math.min(...mine)).toBeLessThanOrEqual(500);
      expect(Math.max(...mine)).toBeGreaterThan(500);
      // Four aspects in two frames: no point of this body sits closer to price.
      expect(Math.max(...mine) - Math.min(...mine)).toBeLessThanOrEqual(360);
    }
  });

  it("puts heliocentric Jupiter's own longitude on the list when price is just above it", () => {
    const jup = planetLongitudes(date).helio.Jupiter;
    const below = activeAngleLevels(date, 360 + jup + 0.1, 1).find((l) => l.label.endsWith("Jupiter") && l.price <= 360 + jup + 0.1)!;
    expect(below.price).toBeCloseTo(360 + jup, 0);
    expect(below.label).toBe("Active angle: on heliocentric Jupiter");
  });

  it("scales by the price unit and reaches the S/R list through the master levels", () => {
    const daily: Bar[] = bars("2026-06-01", 40, 50);
    const master = gannMasterLevels(daily, daily, 50, date);
    const angles = master.filter((l) => l.source === "activeAngle");
    // One above price per body always; one below only where a point sits above zero.
    expect(angles.filter((l) => l.price > 50)).toHaveLength(3);
    expect(angles.every((l) => l.price > 0)).toBe(true);
  });
});

describe("jensenLevels (square of 90 as price levels)", () => {
  it("gives the nearest square-of-90 point above and below price, measured from the low", () => {
    // Low 40 (bar 40 days back), price 72: 30 points above sits below, 45 above.
    const levels = jensenLevels(bars("2026-06-01", 40, 72), 72, 1);
    expect(levels.map((l) => l.price)).toEqual([70, 85]);
    expect(levels[1].label).toContain("45 points above the low (square point)");
    expect(levels[0].label).toContain("(trine point)");
  });

  it("reaches the S/R list through the master levels", () => {
    const daily = bars("2026-06-01", 40, 72);
    expect(gannMasterLevels(daily, daily, 72, new Date("2026-06-01T12:00:00Z")).filter((l) => l.source === "jensen")).toHaveLength(2);
  });
});
