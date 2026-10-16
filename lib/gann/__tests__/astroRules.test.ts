import { describe, expect, it } from "vitest";
import { Body, Ecliptic, GeoVector, SunPosition } from "astronomy-engine";
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
    // Low 40 (bar 40 days back), price 72 at the high of 72.5: 5⅝ under the
    // high sits below (30 over the low, 70, is a trine point, so not a level),
    // and 45 over the low above, doubly strong.
    const levels = jensenLevels(bars("2026-06-01", 40, 72), 72, 1);
    expect(levels.map((l) => l.price)).toEqual([66.875, 85]);
    expect(levels[1].label).toContain("45 points above the low (square point, doubly strong)");
    expect(levels[0].label).toContain("below the high (square point)");
  });

  it("reaches the S/R list through the master levels", () => {
    const daily = bars("2026-06-01", 40, 72);
    expect(gannMasterLevels(daily, daily, 72, new Date("2026-06-01T12:00:00Z")).filter((l) => l.source === "jensen")).toHaveLength(2);
  });
});

describe("readAstroRules: the Sun's travel and Mars's half return (A-ASTRO-03, A-ASTRO-07)", () => {
  const noon = (d: string) => new Date(`${d}T12:00:00Z`);
  const mod = (x: number) => ((x % 360) + 360) % 360;
  /** A low on `lowDate`, then daily bars from `from` to `to` closing at `close`. */
  function lowThen(lowDate: string, low: number, from: string, to: string, close: number): Bar[] {
    const out: Bar[] = [{ t: noon(lowDate).toISOString(), o: low + 1, h: low + 2, l: low, c: low + 1, v: 1000 }];
    for (let t = noon(from).getTime(); t <= noon(to).getTime(); t += DAY) {
      out.push({ t: new Date(t).toISOString(), o: close, h: close + 0.5, l: close - 0.5, c: close, v: 1000 });
    }
    return out;
  }

  it("adds the Sun's travel since the low to the low: the coffee case, 435 + 8253 degrees near 8688", () => {
    // 8373 days after the low is 8253 degrees of mean solar travel.
    const asOf = noon("2022-12-13");
    const series = lowThen("2000-01-10", 435, "2022-11-10", "2022-12-13", 500);
    const r = readAstroRules(series, asOf, 1)!;
    const travel = (8373 * 360) / 365.2422;
    expect(Math.floor(travel / 360)).toBe(22);
    const exact = mod(SunPosition(asOf).elon - SunPosition(noon("2000-01-10")).elon);
    expect(r.sunTravel!.level).toBeCloseTo(435 + 22 * 360 + exact, 6);
    expect(Math.abs(r.sunTravel!.level - 8688)).toBeLessThan(3);
  });

  const marsAt = (d: Date) => Ecliptic(GeoVector(Body.Mars, d, true)).elon;

  it("projects the date geocentric Mars stands opposite its place at the low", () => {
    const r = readAstroRules(bars("2026-06-01", 40, 50), noon("2026-06-01"), 1)!;
    const lowDate = r.marsHalfReturn!.lowDate;
    const next = r.marsHalfReturn!.next!;
    const target = mod(marsAt(noon(lowDate)) + 180);
    const off = Math.abs(((mod(planetLongitudes(noon(next)).geo.Mars - target) + 180) % 360) - 180);
    expect(off).toBeLessThan(1);
  });

  it("counts the third pass of a retrograde loop over the opposite point", () => {
    // Low on 2024-02-06 with Mars near 294.8; the opposite point, 114.8, is
    // crossed on 2024-10-22, again retrograde on 2025-01-20, and a third time
    // on 2025-04-05.
    const series = lowThen("2024-02-06", 40, "2024-02-07", "2025-04-05", 50);
    const r = readAstroRules(series, noon("2025-04-05"), 1)!;
    expect(r.marsHalfReturn).toMatchObject({ lowDate: "2024-02-06", today: true, pass: 3 });
  });
});
