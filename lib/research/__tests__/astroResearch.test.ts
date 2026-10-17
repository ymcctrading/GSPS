import { describe, expect, it } from "vitest";
import { SIDEREAL_DAYS, synodicPeriod } from "@/lib/research/planetaryPeriods";
import { JUPITER_SATURN_MONTHS, jupiterSaturnSubdivisions, projectFromPivot } from "@/lib/research/jupiterSaturn";
import { bucholtzAspect } from "@/lib/research/aspects";
import { eventTurnRate } from "@/lib/research/eventDateTest";
import { solarEclipseDates } from "@/lib/research/eclipseTest";
import { newAndFullMoons } from "@/lib/research/lunarTest";
import { scoreForecast, type ConditionalForecast } from "@/lib/research/forecastLog";
import type { Bar } from "@/lib/types";

const DAY = 86_400_000;
const utc = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe("planetary periods (C-ASTRO-01, C-ASTRO-12)", () => {
  it("corrects the compiler's Mercury and Neptune figures", () => {
    expect(SIDEREAL_DAYS.Mercury).toBeCloseTo(87.97, 1);
    expect(Math.abs(SIDEREAL_DAYS.Neptune - 60190) / 60190).toBeLessThan(0.005);
  });
  it("gives the Earth-Mars synodic period as about 780 days", () => {
    expect(synodicPeriod(SIDEREAL_DAYS.Earth, SIDEREAL_DAYS.Mars)).toBeCloseTo(780, -0);
    expect(synodicPeriod(SIDEREAL_DAYS.Mars, SIDEREAL_DAYS.Earth)).toBeCloseTo(780, -0);
  });
  it("gives the Jupiter-Saturn synodic period as about 19.86 years", () => {
    expect(synodicPeriod(SIDEREAL_DAYS.Jupiter, SIDEREAL_DAYS.Saturn) / 365.25).toBeCloseTo(19.86, 1);
  });
});

describe("Jupiter-Saturn subdivisions (C-ASTRO-11)", () => {
  it("divides 238.2 months by 4 to 9", () => {
    expect(JUPITER_SATURN_MONTHS).toBe(238.2);
    expect(jupiterSaturnSubdivisions().map((s) => Math.round(s.months * 10) / 10)).toEqual([59.6, 47.6, 39.7, 34, 29.8, 26.5]);
  });
  it("projects each subdivision forward from a pivot", () => {
    const out = projectFromPivot(utc("2000-01-03"));
    expect(out).toHaveLength(6);
    expect(out[5].n).toBe(9);
    expect((out[0].at - utc("2000-01-03")) / DAY).toBeCloseTo((238.2 / 4) * (365.25 / 12), 3);
  });
});

describe("Bucholtz's aspect orbs (C-ASTRO-08)", () => {
  it("reads 87 degrees as a square and 84 degrees as nothing", () => {
    expect(bucholtzAspect(10, 97)?.name).toBe("square");
    expect(bucholtzAspect(10, 94)).toBeNull();
  });
  it("uses the wide orb for a conjunction across 0 degrees", () => {
    expect(bucholtzAspect(355, 4)).toMatchObject({ name: "conjunction", angle: 0 });
    expect(bucholtzAspect(355, 6)).toBeNull();
  });
  it("uses the narrow orb for a semi-square", () => {
    expect(bucholtzAspect(0, 47)?.name).toBe("semi-square");
    expect(bucholtzAspect(0, 49)).toBeNull();
  });
});

describe("event-date turn rate against a circular shift (C-ASTRO-07, C-ASTRO-10)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = utc("2015-01-01");
  const sessions = Array.from({ length: 2000 }, (_, i) => start + i * DAY);
  const events = Array.from({ length: 60 }, () => start + Math.floor(rnd() * 1990) * DAY).sort((a, b) => a - b);

  it("finds a strong rate when every event is a turn", () => {
    const turns = events.map((e) => sessions.indexOf(e));
    const r = eventTurnRate(sessions, turns, events);
    expect(r.observed).toBe(1);
    expect(r.p).toBeLessThan(0.01);
  });
  it("finds no rate when there are no turns", () => {
    const r = eventTurnRate(sessions, [], events);
    expect(r.observed).toBe(0);
    expect(r.p).toBe(1);
  });
  it("finds no rate when turns are unrelated to the events", () => {
    const turns = Array.from({ length: 60 }, () => Math.floor(rnd() * 2000)).sort((a, b) => a - b);
    expect(eventTurnRate(sessions, turns, events).p).toBeGreaterThan(0.05);
  });
});

describe("eclipse and lunar dates", () => {
  it("lists the two solar eclipses of 2020", () => {
    expect(solarEclipseDates(utc("2020-01-01"), utc("2021-01-01")).map((t) => new Date(t).toISOString().slice(0, 10))).toEqual(["2020-06-21", "2020-12-14"]);
  });
  it("lists January 2024's new and full moons", () => {
    expect(newAndFullMoons(utc("2024-01-01"), utc("2024-02-01")).map((m) => `${m.phase} ${new Date(m.at).toISOString().slice(0, 10)}`)).toEqual(["new 2024-01-11", "full 2024-01-25"]);
  });
});

describe("conditional forecast record (A-ASTRO-08)", () => {
  const bars: Bar[] = Array.from({ length: 60 }, (_, i) => {
    const t = utc("2026-03-15") + i * DAY;
    // Top on Mar 23, down to Apr 15, up to Apr 16, down after.
    const d = i <= 8 ? 100 + i : i <= 31 ? 108 - (i - 8) : i === 32 ? 90 : 90 - (i - 32);
    return { t: new Date(t).toISOString(), o: d, h: d + 0.5, l: d - 0.5, c: d, v: 1 };
  });
  const forecast: ConditionalForecast = {
    id: "w046-1954",
    source: "W046 pp.2-3",
    recordedAt: utc("2026-03-01"),
    trigger: { kind: "topInWindow", from: utc("2026-03-22"), to: utc("2026-03-24") },
    legs: [
      { until: utc("2026-04-15"), direction: "down" },
      { until: utc("2026-04-16"), direction: "up" },
      { until: utc("2026-04-30"), direction: "down" },
    ],
  };
  it("is not scored before its last leg ends", () => {
    expect(scoreForecast(forecast, bars, utc("2026-04-20"))).toBeNull();
  });
  it("scores each leg after the fact", () => {
    const s = scoreForecast(forecast, bars, utc("2026-05-10"))!;
    expect(s.triggered).toBe(true);
    expect(s.legs.map((l) => l.hit)).toEqual([true, true, true]);
  });
  it("is not triggered when the top falls outside the window", () => {
    const s = scoreForecast({ ...forecast, trigger: { ...forecast.trigger, from: utc("2026-03-28"), to: utc("2026-03-30") } }, bars, utc("2026-05-10"))!;
    expect(s.triggered).toBe(false);
    expect(s.legs).toEqual([]);
  });
  it("refuses a forecast recorded after its trigger window opened", () => {
    expect(() => scoreForecast({ ...forecast, recordedAt: utc("2026-03-23") }, bars, utc("2026-05-10"))).toThrow(/pre-registered/);
  });
});
